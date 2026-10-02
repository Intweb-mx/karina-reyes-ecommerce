import {
  addReservationEvent,
  claimConfirmationEmail,
  getCampaignById,
  releaseConfirmationEmail,
  type Database,
  type PickupPoint,
  type PresaleReservation,
} from "@inttimo/database";
import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";
import { business } from "../../content/legal/business.ts";
import { formatMoney } from "../../lib/format.ts";

export type MailSender = (mail: Mail) => Promise<void>;

type Point = PickupPoint | undefined;

export function formatAddress(reservation: Pick<PresaleReservation, "deliveryAddress" | "shippingAddress">): string | null {
  const a = reservation.deliveryAddress;
  if (a) return [a.name, a.street, a.neighborhood, `${a.postalCode} ${a.city}`, a.state, a.reference ? `Ref.: ${a.reference}` : null].filter(Boolean).join(", ");
  const s = reservation.shippingAddress;
  if (!s) return null;
  const parts = [s.name, s.line1, s.line2, [s.postalCode, s.city].filter(Boolean).join(" "), s.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Correo PAGO CONFIRMADO: texto exacto de "Especificaciones finales postcompra UNO+UNO" (1 oct 2026, §4).
 * No afirma que esté enviado ni "guía generada": eso lo dice solo el correo de ENVIADO/LISTO PARA RECOGER.
 */
function customerMail(reservation: PresaleReservation, productName: string, point: Point): Mail {
  const total = formatMoney(reservation.totalAmount, reservation.currency);
  const address = formatAddress(reservation);
  const lines = [
    `Hola ${reservation.fullName}: Recibimos correctamente tu compra de ${productName}. Tu pedido ya está confirmado.`,
    "",
    `Folio: ${reservation.code}`,
    `Cantidad: ${reservation.quantity}`,
    `Producto: ${productName}`,
    `Total pagado: ${total}`,
    `Método de entrega: ${reservation.deliveryMethod === "pickup" ? "RECOLECCIÓN" : "ENVÍO A DOMICILIO"}`,
    ...(point ? [`Punto seleccionado: ${point.name}`] : []),
    ...(address && reservation.deliveryMethod === "shipping" ? [`Dirección de entrega: ${address}`] : []),
    "",
    "Te avisaremos por correo cuando tu pedido avance al siguiente paso.",
    "Guarda este correo y tu folio como comprobante de compra.",
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · Horario: ${business.hours} · Respuesta: ${business.responseTime}.`,
    "",
    "— inttimo —",
  ];
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");
  return { to: reservation.email, subject: `Tu pedido de ${productName} está confirmado · ${reservation.code}`, text: lines.join("\n"), html };
}

function internalMail(to: string, reservation: PresaleReservation, productName: string, point: Point): Mail {
  const text = [
    `Nueva reserva pagada de ${productName}.`,
    `Folio: ${reservation.code}`,
    `Cantidad: ${reservation.quantity}`,
    `Entrega: ${reservation.deliveryMethod === "pickup" ? `Recolección${point ? ` · ${point.name}` : ""}` : "Envío a domicilio"}`,
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
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);

  try {
    await deps.send(customerMail(reservation, productName, point));
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_SENT", "api");
  } catch (error) {
    await releaseConfirmationEmail(db, reservation.id);
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    return "failed";
  }

  if (deps.notifyEmail) {
    await deps.send(internalMail(deps.notifyEmail, reservation, productName, point)).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "warn", msg: "presale_internal_notify_failed", reservationId, error: String(error) }));
    });
  }
  return "sent";
}

// ---------- Entrega ----------

const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");

export type BonusEmailInfo = { title: string; url: string; expiresAt: Date };

/**
 * Bloque de bonus dentro del correo de ENVIADO / LISTO PARA RECOGER (nunca un correo aparte, §3).
 * Vacío si la campaña no tiene bonus configurado o el pedido no es elegible: no se menciona el bonus en absoluto.
 */
function bonusBlock(productName: string, statusLead: string, bonus: BonusEmailInfo | null): string[] {
  if (!bonus) return [];
  const until = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(bonus.expiresAt);
  return [
    "",
    `Y ahora que tu ${productName} ${statusLead}, también queremos entregarte algo más por haber sido parte de la preventa.`,
    "",
    "BONUS DE PREVENTA",
    bonus.title,
    `Accede aquí: ${bonus.url}`,
    `Disponible hasta el ${until}.`,
  ];
}

/**
 * Correo LISTO PARA RECOGER / ENVIADO: textos exactos de "Especificaciones finales postcompra UNO+UNO"
 * (1 oct 2026, §5–6). El bonus, si aplica, va dentro de este mismo correo, nunca aparte.
 * Las instrucciones de recolección distinguen Sophos·Baluarte de Costco Chihuahua: son los dos únicos puntos de la campaña.
 */
export function fulfillmentMail(reservation: PresaleReservation, productName: string, note: string | null, point: Point, bonus: BonusEmailInfo | null): Mail {
  const pickup = reservation.fulfillmentStatus === "ready_for_pickup";
  const closing = [...(note ? ["", note] : []), ...bonusBlock(productName, pickup ? "está listo" : "va en camino", bonus), "", `Gracias por ser parte de esta primera etapa de ${productName}.`, "", "— inttimo —"];

  if (pickup) {
    const costco = point?.id === "costco";
    const lines = [
      `Hola ${reservation.fullName}: Tu ${productName} ya está listo para recoger.`,
      "",
      `Folio: ${reservation.code}`,
      `Cantidad: ${reservation.quantity}`,
      costco ? `Punto seleccionado: ${point?.name ?? ""}` : `Punto de recolección: ${point?.name ?? ""}`,
      costco
        ? "La entrega se realiza previa confirmación de día y horario. Nos pondremos en contacto contigo para acordarlo."
        : `Horario: ${point?.schedule ?? ""}`,
      ...(costco
        ? ["IMPORTANTE: No acudas al punto hasta recibir la confirmación del día y horario de entrega."]
        : ["Al recogerlo, presenta tu nombre y número de pedido."]),
      ...closing,
    ];
    return { to: reservation.email, subject: `Tu ${productName} está listo para recoger · ${reservation.code}`, text: lines.join("\n"), html: toHtml(lines) };
  }

  const lines = [
    `Hola ${reservation.fullName}: Tu ${productName} ya va en camino.`,
    "",
    `Folio: ${reservation.code}`,
    `Cantidad: ${reservation.quantity}`,
    `Paquetería: ${reservation.carrier ?? "—"}`,
    `Número de guía: ${reservation.trackingNumber ?? "—"}`,
    ...(reservation.trackingUrl ? [`Puedes seguir tu envío aquí: ${reservation.trackingUrl}`] : []),
    "La actualización de movimientos puede tardar un poco en aparecer después de que la paquetería recibe el paquete.",
    ...closing,
  ];
  return { to: reservation.email, subject: `Tu ${productName} ya va en camino · ${reservation.code}`, text: lines.join("\n"), html: toHtml(lines) };
}

/** Reenvío manual del bonus (p. ej. el cliente reporta que no le llegó el correo de ENVIADO/LISTO), sin tocar el estado del pedido. */
export function bonusMail(reservation: PresaleReservation, productName: string, bonusTitle: string, url: string, expiresAt: Date): Mail {
  const until = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(expiresAt);
  const lines = [
    `Hola ${reservation.fullName}:`,
    "",
    `Aquí está de nuevo tu bonus de preventa de ${productName}: ${bonusTitle}.`,
    "",
    `Accede aquí: ${url}`,
    "",
    `Este enlace es personal y estará disponible hasta el ${until}. El contenido es para tu uso personal; no lo compartas ni lo publiques.`,
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · ${business.hours}.`,
    "",
    "— inttimo —",
  ];
  return { to: reservation.email, subject: `Tu bonus de preventa de ${productName}`, text: lines.join("\n"), html: toHtml(lines) };
}
