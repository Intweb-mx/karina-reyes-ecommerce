import { listPaidWithoutConfirmation, listUnsettledReservations, type Database } from "@inttimo/database";
import type { PaymentGateway } from "./gateway.ts";
import { sendConfirmationIfNeeded, type MailSender } from "./notifications.ts";
import { applySnapshot } from "./settlement.ts";

export type ReconcileReport = { checked: number; updated: { code: string; status: string }[]; emails: { sent: number; failed: number }; errors: string[] };

/**
 * Red de seguridad por si un webhook no llegó: consulta a Stripe las reservas
 * sin resolver y reintenta los correos de confirmación pendientes.
 */
export async function reconcilePresale(
  deps: { db: Database; gateway: PaymentGateway; send: MailSender; notifyEmail?: string | null },
  options: { olderThan: Date },
): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, updated: [], emails: { sent: 0, failed: 0 }, errors: [] };

  for (const reservation of await listUnsettledReservations(deps.db, options.olderThan)) {
    report.checked++;
    try {
      const snapshot = await deps.gateway.retrieveCheckout(reservation.stripeCheckoutSessionId!);
      const updated = await deps.db.transaction((tx) => applySnapshot(tx, reservation, snapshot, "sync", { source: "cli", externalRef: snapshot.id }));
      if (updated) report.updated.push({ code: updated.code, status: updated.status });
    } catch (error) {
      report.errors.push(`${reservation.code}: ${String(error)}`);
    }
  }

  for (const reservation of await listPaidWithoutConfirmation(deps.db)) {
    const result = await sendConfirmationIfNeeded(deps.db, reservation.id, { send: deps.send, notifyEmail: deps.notifyEmail });
    if (result === "sent") report.emails.sent++;
    if (result === "failed") report.emails.failed++;
  }

  return report;
}
