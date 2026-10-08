import { findStoreOrderBySessionId } from "@inttimo/database";
import type { OrderConfirmationResponse } from "../../lib/store/contract.ts";
import { fail, ok, redactError, type StoreDeps, type StoreResult } from "./common.ts";
import { buildOrderView } from "./order-view.ts";
import { applyStoreSettlement } from "./settlement.ts";

/**
 * GET /api/tienda/pedido/confirmacion?session_id=… (regreso de Stripe). Nunca marca pagado solo porque el navegador volvió:
 * si el pedido sigue pendiente pregunta a Stripe y aplica la misma liquidación que el webhook.
 */
export async function getOrderConfirmation(deps: Pick<StoreDeps, "db" | "gateway" | "onPaid" | "onMismatch">, sessionId: string | null): Promise<StoreResult<OrderConfirmationResponse>> {
  if (!sessionId || !/^cs_\w{10,200}$/.test(sessionId)) return fail(400, "validation_error", "El identificador del pago no es válido.");
  let order = await findStoreOrderBySessionId(deps.db, sessionId);
  if (!order) return fail(404, "not_found", "No encontramos tu pedido. Revisa tu correo de confirmación o escríbenos.");

  if (order.paymentStatus === "pending") {
    const pending = order;
    try {
      const snapshot = await deps.gateway.retrieveCheckout(sessionId);
      const settled = await applyStoreSettlement(deps.db, pending, snapshot, "sync", { source: "api", externalRef: snapshot.id });
      if (settled) order = settled.order;
      if (settled?.mismatch && deps.onMismatch) {
        // Aviso al equipo tras liquidar; un fallo se registra y nunca rompe la confirmación.
        try {
          await deps.onMismatch(settled.mismatch);
        } catch (error) {
          console.error(JSON.stringify({ level: "error", msg: "store_confirmation_mismatch_notice_failed", orderNumber: settled.mismatch.orderNumber, error: redactError(error) }));
        }
      }
    } catch (error) {
      // Stripe no respondió: se muestra el último estado conocido; el webhook terminará de actualizarlo.
      console.error(JSON.stringify({ level: "error", msg: "store_confirmation_sync_failed", orderId: pending.id, error: redactError(error) }));
    }
  }
  if (order.paymentStatus === "paid" && !order.confirmationEmailSentAt) {
    // Un fallo del correo (o de la base tras reclamarlo) no debe tumbar la página de un pedido ya pagado.
    try {
      await deps.onPaid?.(order.id);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", msg: "store_confirmation_email_failed", orderId: order.id, orderNumber: order.orderNumber, error: redactError(error) }));
    }
  }
  return ok(await buildOrderView(deps.db, order));
}
