import {
  addReservationEvent,
  claimConfirmationEmail,
  getCampaignById,
  releaseConfirmationEmail,
  type Database,
  type PresaleReservation,
} from "@inttimo/database";
import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";
import { business } from "../../content/legal/business.ts";
import { formatMoney } from "../../lib/format.ts";

export type MailSender = (mail: Mail) => Promise<void>;

function formatAddress(address: PresaleReservation["shippingAddress"]): string | null {
  if (!address) return null;
  const parts = [address.name, address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), address.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Contenido mínimo exigido tras el pago: folio, producto, cantidad, importe, entrega y contacto ("Implementación legal en web", §8). */
function customerMail(reservation: PresaleReservation, productName: string, deliveryNote: string | null): Mail {
  const total = formatMoney(reservation.totalAmount, reservation.currency);
  const address = formatAddress(reservation.shippingAddress);
  const lines = [
    `Hola ${reservation.fullName}:`,
    "",
    `Recibimos tu pedido de preventa de ${productName}. Gracias por tu compra.`,
    "",
    `Número de pedido: ${reservation.code}`,
    `Producto: ${productName}`,
    `Cantidad: ${reservation.quantity}`,
    `Importe pagado: ${total}`,
    ...(address ? [`Datos de entrega: ${address}`] : []),
    `Correo de contacto del pedido: ${reservation.email}`,
    ...(deliveryNote ? ["", deliveryNote] : []),
    "",
    "Si tu pedido es con envío, te comunicaremos la guía de rastreo cuando esté disponible. Si es con recolección en Chihuahua, te avisaremos cuando esté LISTO PARA RECOGER.",
    "",
    "¿Requieres factura? Solicítala después de realizar tu compra.",
    "",
    `Guarda este correo: tu número de pedido es tu comprobante de compra.`,
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · ${business.hours} · respuesta ${business.responseTime}.`,
    "",
    "— inttimo",
  ];
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");
  return { to: reservation.email, subject: `Recibimos tu pedido de preventa de ${productName} (${reservation.code})`, text: lines.join("\n"), html };
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
