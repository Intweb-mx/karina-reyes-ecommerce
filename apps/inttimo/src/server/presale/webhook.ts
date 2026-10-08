import { applyRefund, applyStoreRefund, claimStripeEvent, findReservationByPaymentIntent, findStoreOrderByPaymentIntent, type Database } from "@inttimo/database";
import type Stripe from "stripe";
import { applyStoreSettlement, resolveStoreOrder, type StoreMismatch } from "../store/settlement.ts";
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
  | { result: "applied" | "unchanged"; reservationId: string; status: string }
  | { result: "applied" | "unchanged"; storeOrderId: string; paymentStatus: string; mismatch?: StoreMismatch };

/**
 * Procesa un evento ya verificado de la preventa o de la tienda. Las sesiones de la tienda traen metadata.kind = "store";
 * los reembolsos se reconocen por payment intent (primero reservas, luego pedidos de la tienda). Registrar el evento y
 * aplicar su efecto ocurre en la misma transacción: si algo falla no queda marcado y Stripe lo reintenta.
 */
export async function handleStripeEvent(db: Database, event: Stripe.Event): Promise<WebhookOutcome> {
  if (!HANDLED_EVENTS.includes(event.type)) return { result: "ignored" };

  return db.transaction(async (tx): Promise<WebhookOutcome> => {
    if (!(await claimStripeEvent(tx, event.id, event.type))) return { result: "duplicate" };
    const ctx = { source: "stripe" as const, externalRef: event.id };

    const trigger = SESSION_TRIGGERS[event.type];
    if (trigger) {
      const snapshot = snapshotFromSession(event.data.object as Stripe.Checkout.Session);
      if (snapshot.kind === "store") {
        const order = await resolveStoreOrder(tx, snapshot);
        if (!order) return { result: "ignored" };
        const settled = await applyStoreSettlement(tx, order, snapshot, trigger, ctx);
        const current = settled?.order ?? order;
        return { result: settled?.changed ? "applied" : "unchanged", storeOrderId: current.id, paymentStatus: current.paymentStatus, ...(settled?.mismatch ? { mismatch: settled.mismatch } : {}) };
      }
      const reservation = await resolveReservation(tx, snapshot);
      if (!reservation) return { result: "ignored" };
      const updated = await applySnapshot(tx, reservation, snapshot, trigger, ctx);
      return updated
        ? { result: "applied", reservationId: updated.id, status: updated.status }
        : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
    }

    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
    if (!paymentIntentId) return { result: "ignored" };

    const reservation = await findReservationByPaymentIntent(tx, paymentIntentId);
    if (reservation) {
      const updated = await applyRefund(tx, reservation, charge.amount_refunded, ctx);
      return updated
        ? { result: "applied", reservationId: updated.id, status: updated.status }
        : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
    }

    // Reembolso de un pedido de la tienda: se registra; devolver piezas al inventario se decide en el panel (PR B).
    const storeOrder = await findStoreOrderByPaymentIntent(tx, paymentIntentId);
    if (!storeOrder) return { result: "ignored" };
    const refunded = await applyStoreRefund(tx, storeOrder.id, charge.amount_refunded, ctx);
    const current = refunded?.order ?? storeOrder;
    if (!refunded?.changed && !["paid", "partially_refunded", "refunded"].includes(current.paymentStatus)) {
      // Reembolso de un pedido aún no pagado: no se descarta en silencio; la reconciliación recogerá el estado.
      console.warn(JSON.stringify({ level: "warn", msg: "store_refund_before_paid", orderNumber: current.orderNumber, paymentIntentId }));
    }
    return { result: refunded?.changed ? "applied" : "unchanged", storeOrderId: current.id, paymentStatus: current.paymentStatus };
  });
}
