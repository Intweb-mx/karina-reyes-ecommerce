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

export function deliveryLabel(reservation: Pick<PresaleReservation, "deliveryMethod" | "shippingAmount">): string {
  if (reservation.deliveryMethod === "pickup") return "Recolección en Chihuahua (sin costo)";
  return reservation.shippingAmount > 0 ? "Envío a domicilio" : "Envío a domicilio (costo por confirmar con inttimo)";
}

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
    ...(reservation.shippingAmount > 0 ? [`Envío: ${formatMoney(reservation.shippingAmount, reservation.currency)}`] : []),
    `Importe pagado: ${total}`,
    `Método de entrega: ${deliveryLabel(reservation)}`,
    ...(address && reservation.deliveryMethod === "shipping" ? [`Dirección de envío: ${address}`] : []),
    `Correo de contacto del pedido: ${reservation.email}`,
    ...(deliveryNote ? ["", deliveryNote] : []),
    "",
    reservation.deliveryMethod === "pickup"
      ? "Te avisaremos cuando tu pedido esté LISTO PARA RECOGER, con el punto, fecha y horario. Espera ese aviso antes de acudir."
      : "Te enviaremos la guía de rastreo cuando tu pedido salga a paquetería.",
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
    `Entrega: ${deliveryLabel(reservation)}`,
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

// ---------- Entrega ----------

const signature = () => [
  "",
  `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · ${business.hours}.`,
  "",
  "— inttimo",
];

const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");

/** Aviso al cliente: pedido listo para recoger o enviado con su guía. */
export function fulfillmentMail(reservation: PresaleReservation, productName: string, note: string | null): Mail {
  const pickup = reservation.fulfillmentStatus === "ready_for_pickup";
  const lines = pickup
    ? [
        `Hola ${reservation.fullName}:`,
        "",
        `Tu pedido de ${productName} está LISTO PARA RECOGER.`,
        "",
        `Número de pedido: ${reservation.code}`,
        `Cantidad: ${reservation.quantity}`,
        ...(note ? ["", note] : []),
        "",
        "Al recoger, menciona tu nombre y número de pedido (o muestra este correo). Si otra persona recogerá por ti, avísanos antes.",
        ...signature(),
      ]
    : [
        `Hola ${reservation.fullName}:`,
        "",
        `Tu pedido de ${productName} ya va en camino.`,
        "",
        `Número de pedido: ${reservation.code}`,
        `Paquetería: ${reservation.carrier ?? "—"}`,
        `Número de guía: ${reservation.trackingNumber ?? "—"}`,
        ...(reservation.trackingUrl ? [`Rastreo: ${reservation.trackingUrl}`] : []),
        ...(note ? ["", note] : []),
        "",
        "Los tiempos de entrega dependen de la paquetería. Si notas algún problema con tu envío, escríbenos.",
        ...signature(),
      ];
  const subject = pickup ? `Tu pedido ${reservation.code} está listo para recoger` : `Tu pedido ${reservation.code} va en camino`;
  return { to: reservation.email, subject, text: lines.join("\n"), html: toHtml(lines) };
}

/** Enlace personal y temporal al bonus digital. */
export function bonusMail(reservation: PresaleReservation, productName: string, bonusTitle: string, url: string, expiresAt: Date): Mail {
  const until = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(expiresAt);
  const lines = [
    `Hola ${reservation.fullName}:`,
    "",
    `Gracias por comprar ${productName} en preventa. Aquí está tu bonus exclusivo: ${bonusTitle}.`,
    "",
    `Accede aquí: ${url}`,
    "",
    `Este enlace es personal y estará disponible hasta el ${until}. El contenido es para tu uso personal; no lo compartas ni lo publiques.`,
    ...signature(),
  ];
  return { to: reservation.email, subject: `Tu bonus de preventa de ${productName}`, text: lines.join("\n"), html: toHtml(lines) };
}
