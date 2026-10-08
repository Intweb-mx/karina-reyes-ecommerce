import {
  findStoreOrderById,
  findStoreOrderBySessionId,
  markStoreCheckoutExpired,
  markStoreOrderPaid,
  markStoreOrderPaymentFailed,
  markStoreOrderPaymentMismatch,
  type Database,
  type EventSource,
  type Executor,
  type StoreOrder,
} from "@inttimo/database";
import type { CheckoutSnapshot } from "../presale/gateway.ts";
import type { SnapshotTrigger } from "../presale/settlement.ts";

/** Detalle de un cobro que no coincide con el pedido, para avisar al equipo (sin datos del cliente). */
export type StoreMismatch = {
  orderNumber: string;
  expected: { amount: number; currency: string };
  received: { amount: number | null; currency: string | null };
  reference: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pedido de una sesión de la tienda: por id de sesión o, si el webhook llegó antes de ligarla, por el id del pedido. */
export async function resolveStoreOrder(db: Executor, snapshot: CheckoutSnapshot): Promise<StoreOrder | null> {
  const bySession = await findStoreOrderBySessionId(db, snapshot.id);
  if (bySession) return bySession;
  if (!snapshot.storeOrderId || !UUID.test(snapshot.storeOrderId)) return null;
  const byId = await findStoreOrderById(db, snapshot.storeOrderId.toLowerCase());
  // Se acepta solo si el pedido aún no tiene otra sesión.
  return byId && !byId.stripeCheckoutSessionId ? byId : null;
}

/**
 * Aplica el estado de Stripe al pedido (webhook, confirmación y reconciliación usan esta misma función). Nunca marca pagado
 * si el monto o la moneda no coinciden con el pedido: lo deja como excepción para revisión. Idempotente.
 */
export async function applyStoreSettlement(
  db: Database,
  order: StoreOrder,
  snapshot: CheckoutSnapshot,
  trigger: SnapshotTrigger,
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<{ order: StoreOrder; changed: boolean; mismatch?: StoreMismatch } | null> {
  if (trigger === "async_failed") return markStoreOrderPaymentFailed(db, order.id, { source: ctx.source });
  if (trigger === "expired" || snapshot.status === "expired") return markStoreCheckoutExpired(db, order.id, { source: ctx.source });
  if (snapshot.paymentStatus !== "paid" && snapshot.paymentStatus !== "no_payment_required") return null;

  const expected = { amount: order.totalAmount, currency: order.currency };
  const received = { amount: snapshot.amountTotal, currency: snapshot.currency };
  if (received.amount !== expected.amount || received.currency?.toLowerCase() !== expected.currency.toLowerCase()) {
    console.error(JSON.stringify({ level: "error", msg: "store_amount_mismatch", orderId: order.id, expected, received }));
    const marked = await markStoreOrderPaymentMismatch(db, order.id, { paymentIntentId: snapshot.paymentIntentId, expected, received }, ctx);
    if (!marked) return null;
    const result = { order: marked.order, changed: marked.changed };
    // Avisa al equipo la llamada que marca el pedido o registra un cobro distinto nuevo (aunque el pedido ya estuviera
    // cancelado o pagado); webhooks repetidos y sondeos del mismo cobro no.
    if (!marked.changed && !marked.recorded) return result;
    return { ...result, mismatch: { orderNumber: order.orderNumber, expected, received, reference: snapshot.paymentIntentId ?? snapshot.id } };
  }
  const paid = await markStoreOrderPaid(db, order.id, { paymentIntentId: snapshot.paymentIntentId }, ctx);
  return paid ? { order: paid.order, changed: paid.outcome !== "already_paid" } : null;
}
