import {
  findReservationById,
  findReservationBySessionId,
  markExpired,
  markPaid,
  markPaymentFailed,
  markProcessing,
  type EventSource,
  type Executor,
  type PresaleReservation,
} from "@inttimo/database";
import type { CheckoutSnapshot } from "./gateway.ts";

/** Qué originó la actualización: un evento concreto de Stripe o una consulta directa (confirmación / reconciliación). */
export type SnapshotTrigger = "completed" | "async_succeeded" | "async_failed" | "expired" | "sync";

export async function resolveReservation(db: Executor, snapshot: CheckoutSnapshot): Promise<PresaleReservation | null> {
  const bySession = await findReservationBySessionId(db, snapshot.id);
  if (bySession) return bySession;
  // El webhook puede llegar antes de guardar el id de sesión; se acepta solo si la reserva aún no tiene otra sesión.
  if (!snapshot.reservationId || !/^[0-9a-f-]{36}$/i.test(snapshot.reservationId)) return null;
  const byId = await findReservationById(db, snapshot.reservationId);
  return byId && !byId.stripeCheckoutSessionId ? byId : null;
}

/** Aplica el estado de Stripe a la reserva. Idempotente: repetirlo no cambia nada ni duplica eventos. */
export async function applySnapshot(
  db: Executor,
  reservation: PresaleReservation,
  snapshot: CheckoutSnapshot,
  trigger: SnapshotTrigger,
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<PresaleReservation | null> {
  const details = { paymentIntentId: snapshot.paymentIntentId, shippingAddress: snapshot.shippingAddress };

  if (trigger === "async_failed") return markPaymentFailed(db, reservation.id, ctx);
  if (trigger === "expired" || snapshot.status === "expired") return markExpired(db, reservation.id, ctx);

  if (snapshot.paymentStatus === "paid" || snapshot.paymentStatus === "no_payment_required") {
    if (snapshot.amountTotal !== reservation.totalAmount || snapshot.currency !== reservation.currency) {
      // El precio siempre sale del servidor; si no coincide hay que revisarlo a mano, pero el pago sí ocurrió.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "presale_amount_mismatch",
          reservationId: reservation.id,
          expected: { amount: reservation.totalAmount, currency: reservation.currency },
          received: { amount: snapshot.amountTotal, currency: snapshot.currency },
        }),
      );
    }
    return markPaid(db, reservation.id, details, ctx);
  }

  if (snapshot.status === "complete") return markProcessing(db, reservation.id, details, ctx);
  return null;
}
