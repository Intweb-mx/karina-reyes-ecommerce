import { listStorePaidWithoutConfirmation, listUnsettledStoreOrders, releaseExpiredStoreOrders, type Database } from "@inttimo/database";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { MailSender } from "../presale/notifications.ts";
import { sendStoreConfirmationIfNeeded, storeMismatchMail } from "./notifications.ts";
import { applyStoreSettlement } from "./settlement.ts";

/** Pedidos vencidos que libera, como máximo, cada corrida de `store:reconcile`. */
export const RECONCILE_RELEASE_LIMIT = 1000;

export type StoreReconcileReport = {
  checked: number;
  updated: { orderNumber: string; paymentStatus: string }[];
  released: number;
  emails: { sent: number; failed: number; exceptions: number };
  errors: string[];
};

/**
 * Red de seguridad de la tienda (`pnpm store:reconcile`): 1) consulta a Stripe los pedidos pendientes con sesión y aplica
 * la misma liquidación que el webhook; 2) libera en bloque los apartados vencidos; 3) reintenta los correos pendientes.
 * El orden importa: primero se registra lo que sí se pagó y después se libera lo vencido.
 */
export async function reconcileStore(
  deps: { db: Database; gateway: PaymentGateway; send: MailSender; notifyEmail?: string | null },
  options: { olderThan: Date; now?: Date },
): Promise<StoreReconcileReport> {
  const report: StoreReconcileReport = { checked: 0, updated: [], released: 0, emails: { sent: 0, failed: 0, exceptions: 0 }, errors: [] };

  for (const order of await listUnsettledStoreOrders(deps.db, options.olderThan)) {
    report.checked++;
    try {
      const snapshot = await deps.gateway.retrieveCheckout(order.stripeCheckoutSessionId!);
      const settled = await applyStoreSettlement(deps.db, order, snapshot, "sync", { source: "cli", externalRef: snapshot.id });
      if (settled?.changed && !settled.mismatch) report.updated.push({ orderNumber: settled.order.orderNumber, paymentStatus: settled.order.paymentStatus });
      if (settled?.mismatch && deps.notifyEmail) {
        // Aviso al equipo de un cobro con monto distinto; un fallo se cuenta y no detiene la corrida.
        try {
          await deps.send(storeMismatchMail(deps.notifyEmail, settled.mismatch));
        } catch (error) {
          report.emails.failed++;
          report.errors.push(`${order.orderNumber}: aviso de monto distinto no enviado: ${String(error)}`);
        }
      }
    } catch (error) {
      report.errors.push(`${order.orderNumber}: ${String(error)}`);
    }
  }

  try {
    report.released = await releaseExpiredStoreOrders(deps.db, options.now ?? new Date(), { limit: RECONCILE_RELEASE_LIMIT, source: "cli" });
  } catch (error) {
    report.errors.push(`liberación: ${String(error)}`);
  }

  for (const order of await listStorePaidWithoutConfirmation(deps.db)) {
    const result = await sendStoreConfirmationIfNeeded(deps.db, order.id, { send: deps.send, notifyEmail: deps.notifyEmail });
    if (result === "sent") report.emails.sent++;
    if (result === "failed") report.emails.failed++;
    if (result === "exception") report.emails.exceptions++;
  }

  return report;
}
