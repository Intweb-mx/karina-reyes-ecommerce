import {
  addReservationEvent,
  claimConfirmationEmail,
  findReservationById,
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
    ...(reservation.paymentMethod !== "stripe" ? [`Forma de pago: ${reservation.paymentMethod === "cash" ? "Efectivo" : "Transferencia"}`] : []),
    `Método de entrega: ${reservation.paymentMethod !== "stripe" ? "ENTREGA EN PERSONA" : reservation.deliveryMethod === "pickup" ? "RECOLECCIÓN" : "ENVÍO A DOMICILIO"}`,
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

/**
 * Reenvío manual desde el panel. Si la confirmación nunca salió, hace el envío normal (y la marca como enviada);
 * si ya salió, la manda otra vez y lo deja en el historial.
 */
export async function resendConfirmation(db: Database, reservationId: string, deps: { send: MailSender }): Promise<"sent" | "failed" | "not_paid"> {
  const reservation = await findReservationById(db, reservationId);
  if (!reservation?.email || (reservation.status !== "paid" && reservation.status !== "partially_refunded")) return "not_paid";
  const first = await sendConfirmationIfNeeded(db, reservationId, deps);
  if (first !== "skipped") return first;

  const campaign = await getCampaignById(db, reservation.campaignId);
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);
  try {
    await deps.send(customerMail(reservation, campaign?.productName ?? "inttimo", point));
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_SENT", "panel", { metadata: { manual: true } });
    return "sent";
  } catch (error) {
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_FAILED", "panel", { metadata: { manual: true, error: String(error).slice(0, 300) } });
    return "failed";
  }
}

// ---------- Entrega ----------

const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");

export type BonusEmailInfo = { title: string; url: string; expiresAt: Date };

/**
 * Correo LISTO PARA RECOGER / ENVIADO: textos exactos de "Especificaciones finales postcompra UNO+UNO"
 * (1 oct 2026, §5–6). Estos correos no llevan bonus: se libera al marcar ENTREGADO (`deliveredMail`).
 * Las instrucciones de recolección distinguen Sophos·Baluarte de Costco Chihuahua: son los dos únicos puntos de la campaña.
 */
export function fulfillmentMail(reservation: PresaleReservation, productName: string, note: string | null, point: Point): Mail {
  const pickup = reservation.fulfillmentStatus === "ready_for_pickup";
  const closing = [...(note ? ["", note] : []), "", `Gracias por ser parte de esta primera etapa de ${productName}.`, "", "— inttimo —"];

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

/** Correo de ENTREGADO: confirma la entrega y trae el acceso personal al bonus (enlace temporal). */
export function deliveredMail(reservation: PresaleReservation, productName: string, bonus: BonusEmailInfo): Mail {
  const until = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(bonus.expiresAt);
  const intro = [
    `Hola ${reservation.fullName}: Tu ${productName} ya fue entregado.`,
    "",
    `Folio: ${reservation.code}`,
    "",
    "Gracias por ser parte de esta primera etapa. Por haber comprado en la preventa, queremos entregarte algo más:",
    "",
    "BONUS DE PREVENTA",
    bonus.title,
    `Abrir mi bonus: ${bonus.url}`,
  ];
  const outro = [
    "",
    `Este enlace es personal y estará disponible hasta el ${until}. El contenido es para tu uso personal; no lo compartas ni lo publiques.`,
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · ${business.hours}.`,
    "",
    "— inttimo —",
  ];
  const button = `<p><a href="${escapeHtml(bonus.url)}" style="display:inline-block;padding:12px 24px;background:#221c17;color:#ffffff;text-decoration:none">Abrir mi bonus</a></p>`;
  const htmlIntro = toHtml(intro.slice(0, -1));
  return {
    to: reservation.email,
    subject: `Tu ${productName} fue entregado · tu bonus de preventa · ${reservation.code}`,
    text: [...intro, ...outro].join("\n"),
    html: htmlIntro + button + toHtml(outro),
  };
}

/** Reenvío manual del bonus (p. ej. el cliente reporta que no le llegó el correo de ENTREGADO), sin tocar el estado del pedido. */
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
