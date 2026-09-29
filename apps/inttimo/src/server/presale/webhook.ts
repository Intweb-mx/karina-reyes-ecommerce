import { applyRefund, claimStripeEvent, findReservationByPaymentIntent, type Database } from "@inttimo/database";
import type Stripe from "stripe";
import { snapshotFromSession } from "./gateway.ts";
import { applySnapshot, resolveReservation, type SnapshotTrigger } from "./settlement.ts";

const SESSION_TRIGGERS: Partial<Record<Stripe.Event["type"], SnapshotTrigger>> = {
  "checkout.session.completed": "completed",
  "checkout.session.async_payment_succeeded": "async_succeeded",
  "checkout.session.async_payment_failed": "async_failed",
  "checkout.session.expired": "expired",
};

export const HANDLED_EVENTS = [...Object.keys(SESSION_TRIGGERS), "charge.refunded"] as Stripe.Event["type"][];

export type WebhookOutcome =
  | { result: "duplicate" | "ignored" }
  | { result: "applied" | "unchanged"; reservationId: string; status: string };

/**
 * Procesa un evento ya verificado. Registrar el evento y aplicar su efecto ocurre
 * en la misma transacción: si algo falla no queda marcado y Stripe lo reintenta.
 */
export async function handleStripeEvent(db: Database, event: Stripe.Event): Promise<WebhookOutcome> {
  if (!HANDLED_EVENTS.includes(event.type)) return { result: "ignored" };

  return db.transaction(async (tx): Promise<WebhookOutcome> => {
    if (!(await claimStripeEvent(tx, event.id, event.type))) return { result: "duplicate" };
    const ctx = { source: "stripe" as const, externalRef: event.id };

    const trigger = SESSION_TRIGGERS[event.type];
    if (trigger) {
      const snapshot = snapshotFromSession(event.data.object as Stripe.Checkout.Session);
      const reservation = await resolveReservation(tx, snapshot);
      if (!reservation) return { result: "ignored" };
      const updated = await applySnapshot(tx, reservation, snapshot, trigger, ctx);
      return updated
        ? { result: "applied", reservationId: updated.id, status: updated.status }
        : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
    }

    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
    const reservation = paymentIntentId ? await findReservationByPaymentIntent(tx, paymentIntentId) : null;
    if (!reservation) return { result: "ignored" };
    const updated = await applyRefund(tx, reservation, charge.amount_refunded, ctx);
    return updated
      ? { result: "applied", reservationId: updated.id, status: updated.status }
      : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
  });
}
