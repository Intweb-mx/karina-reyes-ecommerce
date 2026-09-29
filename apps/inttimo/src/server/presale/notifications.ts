import {
  addReservationEvent,
  claimConfirmationEmail,
  getCampaignById,
  releaseConfirmationEmail,
  type Database,
  type PresaleReservation,
} from "@inttimo/database";
import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";

export type MailSender = (mail: Mail) => Promise<void>;

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

function customerMail(reservation: PresaleReservation, productName: string, deliveryNote: string | null): Mail {
  const total = formatMoney(reservation.totalAmount, reservation.currency);
  const lines = [
    `Hola ${reservation.fullName}:`,
    "",
    `Confirmamos tu lugar en la preventa de ${productName}.`,
    "",
    `Folio: ${reservation.code}`,
    `Cantidad: ${reservation.quantity}`,
    `Total pagado: ${total}`,
    ...(deliveryNote ? ["", deliveryNote] : []),
    "",
    "Guarda este correo: tu folio es tu comprobante de reserva.",
    "",
    "— inttimo",
  ];
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");
  return { to: reservation.email, subject: `Tu lugar en la preventa de ${productName} (${reservation.code})`, text: lines.join("\n"), html };
}

function internalMail(to: string, reservation: PresaleReservation, productName: string): Mail {
  const text = [
    `Nueva reserva pagada de ${productName}.`,
    `Folio: ${reservation.code}`,
    `Cantidad: ${reservation.quantity}`,
    `Total: ${formatMoney(reservation.totalAmount, reservation.currency)}`,
  ].join("\n");
  return { to, subject: `Preventa: reserva pagada ${reservation.code}`, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

/**
 * Envía la confirmación una sola vez por reserva pagada. Si el envío falla se
 * libera para que un reintento (webhook, confirmación o `presale:reconcile`) lo vuelva a intentar.
 */
export async function sendConfirmationIfNeeded(
  db: Database,
  reservationId: string,
  deps: { send: MailSender; notifyEmail?: string | null },
): Promise<"sent" | "skipped" | "failed"> {
  const reservation = await claimConfirmationEmail(db, reservationId);
  if (!reservation) return "skipped";
  const campaign = await getCampaignById(db, reservation.campaignId);
  const productName = campaign?.productName ?? "inttimo";

  try {
    await deps.send(customerMail(reservation, productName, campaign?.deliveryNote ?? null));
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_SENT", "api");
  } catch (error) {
    await releaseConfirmationEmail(db, reservation.id);
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    return "failed";
  }

  if (deps.notifyEmail) {
    await deps.send(internalMail(deps.notifyEmail, reservation, productName)).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "warn", msg: "presale_internal_notify_failed", reservationId, error: String(error) }));
    });
  }
  return "sent";
}
