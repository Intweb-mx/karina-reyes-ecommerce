/*
 * Correos de pedidos de la tienda.
 * COPIA PENDIENTE DE APROBACIÓN DE KARINA (los textos de estos correos son funcionales, no aprobados): texto funcional que no promete envío ni guía (eso lo dirán los correos de
 * ENVIADO / LISTO PARA RECOGER que manda el panel, PR B).
 */
import {
  addStoreOrderEvent,
  claimStoreConfirmationEmail,
  findStoreOrderByNumber,
  getStoreSettings,
  listStoreOrderItems,
  markStoreDigitalOrderDelivered,
  releaseStoreConfirmationEmail,
  type Database,
  type PickupPoint,
  type StoreOrder,
  type StoreOrderItem,
} from "@inttimo/database";
import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";
import { business } from "../../content/legal/business.ts";
import { formatMoney } from "../../lib/format.ts";
import type { MailSender } from "../presale/notifications.ts";
import { redactError } from "./common.ts";
import { issueDownloadLinks } from "./downloads.ts";
import type { StoreMismatch } from "./settlement.ts";

/** Texto → HTML; las direcciones https quedan como enlaces (p. ej. la descarga digital). */
const linkify = (escaped: string) => escaped.replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${linkify(escapeHtml(line))}</p>` : "")).join("");

function addressText(order: StoreOrder): string | null {
  const a = order.deliveryAddress;
  return a ? [a.name, a.street, a.neighborhood, `${a.postalCode} ${a.city}`, a.state, a.reference ? `Ref.: ${a.reference}` : null].filter(Boolean).join(", ") : null;
}

function itemLines(order: StoreOrder, items: StoreOrderItem[]): string[] {
  return items.map((item) => `• ${item.name} × ${item.quantity}: ${formatMoney(item.unitAmount * item.quantity, order.currency)}`);
}

export type DownloadInfo = { name: string; url: string };

/** Enlaces de descarga de los productos digitales (cada uno sirve una sola vez). */
function downloadLines(downloads: DownloadInfo[]): string[] {
  if (!downloads.length) return [];
  return [
    "",
    "TU DESCARGA DIGITAL",
    ...downloads.map((download) => `• ${download.name}: ${download.url}`),
    "Este enlace sirve UNA sola vez: ábrelo cuando estés listo para guardar el archivo y descárgalo en el dispositivo donde lo vas a leer. Si tienes algún problema, escríbenos y te mandamos uno nuevo.",
  ];
}

/** Pedido pagado, para el cliente. `downloads`: enlaces de un solo uso de sus productos digitales. */
export function storeCustomerMail(order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined, downloads: DownloadInfo[] = []): Mail {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const pickup = order.deliveryMethod === "pickup";
  const digital = order.deliveryMethod === "digital";
  const address = addressText(order);
  const lines = [
    `Hola ${order.fullName}: recibimos tu pago. Tu pedido ${order.orderNumber} está confirmado.`,
    "",
    ...itemLines(order, items),
    `Subtotal: ${money(order.subtotalAmount)}`,
    ...(order.discountAmount ? [`Descuento: −${money(order.discountAmount)}`] : []),
    ...(digital ? [] : [`${pickup ? "Recolección" : "Envío"}: ${!pickup && order.shippingAmount === 0 ? "gratis" : money(order.shippingAmount)}`]),
    `Total pagado: ${money(order.totalAmount)}`,
    ...downloadLines(downloads),
    ...(digital
      ? []
      : [
          "",
          `Método de entrega: ${pickup ? "RECOLECCIÓN" : "ENVÍO A DOMICILIO"}`,
          ...(pickup && point ? [`Punto seleccionado: ${point.name}`] : []),
          ...(!pickup && address ? [`Dirección de entrega: ${address}`] : []),
          "",
          pickup ? "Te avisaremos por correo cuando tu pedido esté LISTO PARA RECOGER. Espera ese aviso antes de acudir." : "Te enviaremos la guía de rastreo por correo cuando tu pedido salga.",
        ]),
    "",
    "Guarda este correo y tu número de pedido como comprobante de compra.",
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · Horario: ${business.hours} · Respuesta: ${business.responseTime}.`,
    "",
    "— inttimo —",
  ];
  return { to: order.email, subject: `Tu pedido de inttimo está confirmado · ${order.orderNumber}`, text: lines.join("\n"), html: toHtml(lines) };
}

/** Aviso interno al equipo (pedido pagado o pago con incidencia). */
export function storeTeamMail(to: string, order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail {
  const exception = order.fulfillmentStatus === "exception";
  const text = [
    exception ? "ATENCIÓN: pago recibido con incidencia (sin stock para surtirlo). Revísalo en el panel y reembolsa si corresponde." : "Nuevo pedido pagado en la tienda.",
    `Folio: ${order.orderNumber}`,
    ...itemLines(order, items),
    `Entrega: ${order.deliveryMethod === "pickup" ? `Recolección${point ? ` · ${point.name}` : ""}` : order.deliveryMethod === "digital" ? "Descarga digital (enlace enviado al cliente)" : "Envío a domicilio"}`,
    `Total: ${formatMoney(order.totalAmount, order.currency)}`,
  ].join("\n");
  return { to, subject: exception ? `Tienda: pago con incidencia ${order.orderNumber}` : `Tienda: pedido pagado ${order.orderNumber}`, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

/** Aviso interno de un cobro cuyo monto o moneda no coincide con el pedido: solo folio y referencias, sin datos del cliente. */
export function storeMismatchMail(to: string, mismatch: StoreMismatch): Mail {
  const show = (value: { amount: number | null; currency: string | null }) =>
    value.amount === null ? `monto desconocido ${value.currency ?? ""}`.trim() : formatMoney(value.amount, value.currency ?? "mxn");
  const text = [
    "ATENCIÓN: Stripe cobró un monto distinto al del pedido. El pedido NO se marcó como pagado; revísalo en Stripe y en el panel.",
    `Folio: ${mismatch.orderNumber}`,
    `Esperado: ${show(mismatch.expected)}`,
    `Recibido: ${show(mismatch.received)}`,
    `Referencia de Stripe: ${mismatch.reference}`,
  ].join("\n");
  return { to, subject: `Tienda: cobro con monto distinto ${mismatch.orderNumber}`, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

/**
 * Correo de pedido pagado, una sola vez por pedido. Si algo falla después de reservarlo (leer productos o configuración,
 * armar el correo o enviarlo) se libera la reserva para que el webhook, la confirmación o `store:reconcile` reintenten.
 * Un pedido pagado con incidencia (sin stock) no se confirma al cliente: solo se avisa al equipo, y la reserva se consume
 * únicamente cuando ese aviso salió (o no hay a quién avisar). Nunca se registran correos ni direcciones.
 */
export async function sendStoreConfirmationIfNeeded(
  db: Database,
  orderId: string,
  deps: { send: MailSender; notifyEmail?: string | null; /** Para los enlaces de descarga (solo si el pedido tiene productos digitales). */ siteUrl?: string },
): Promise<"sent" | "skipped" | "failed" | "exception"> {
  const order = await claimStoreConfirmationEmail(db, orderId);
  if (!order) return "skipped";

  /** Devuelve la reserva y deja constancia; cada paso con su propio catch para que nada aquí lance. */
  const giveUp = async (msg: string, error: unknown, recordEvent: boolean): Promise<"failed"> => {
    console.error(JSON.stringify({ level: "error", msg, orderId, error: redactError(error) }));
    await releaseStoreConfirmationEmail(db, order.id).catch((releaseError: unknown) => {
      console.error(JSON.stringify({ level: "error", msg: "store_confirmation_release_failed", orderId, error: redactError(releaseError) }));
    });
    if (recordEvent) {
      await addStoreOrderEvent(db, order.id, "CONFIRMATION_EMAIL_FAILED", "api", { metadata: { error: redactError(error) } }).catch((eventError: unknown) => {
        console.error(JSON.stringify({ level: "error", msg: "store_confirmation_event_failed", orderId, error: redactError(eventError) }));
      });
    }
    return "failed";
  };

  let items: StoreOrderItem[];
  let point: PickupPoint | undefined;
  try {
    items = await listStoreOrderItems(db, order.id);
    point = (await getStoreSettings(db))?.pickupPoints.find((candidate) => candidate.id === order.pickupPointId);
  } catch (error) {
    return giveUp("store_confirmation_failed", error, order.fulfillmentStatus !== "exception");
  }

  if (order.fulfillmentStatus === "exception") {
    if (!deps.notifyEmail) {
      console.error(JSON.stringify({ level: "error", msg: "store_exception_notice_unconfigured", orderId, orderNumber: order.orderNumber }));
      return "exception";
    }
    try {
      await deps.send(storeTeamMail(deps.notifyEmail, order, items, point));
    } catch (error) {
      return giveUp("store_exception_notice_failed", error, false);
    }
    return "exception";
  }

  // Enlaces nuevos en cada intento: si el correo falla, el reintento revoca los que nunca llegaron.
  let downloads: DownloadInfo[];
  try {
    downloads = await issueDownloadLinks(db, order, items, deps.siteUrl ?? "", { source: "api" });
  } catch (error) {
    return giveUp("store_download_links_failed", error, true);
  }
  try {
    await deps.send(storeCustomerMail(order, items, point, downloads));
  } catch (error) {
    return giveUp("store_confirmation_failed", error, true);
  }
  if (order.deliveryMethod === "digital") {
    await markStoreDigitalOrderDelivered(db, order.id, { source: "api" }).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", msg: "store_digital_delivered_failed", orderId, error: redactError(error) }));
    });
  }
  // El correo ya salió: un fallo al registrar el evento no debe liberar la reserva (mandaría un segundo correo).
  await addStoreOrderEvent(db, order.id, "CONFIRMATION_EMAIL_SENT", "api").catch((error: unknown) => {
    console.error(JSON.stringify({ level: "error", msg: "store_confirmation_event_failed", orderId, error: redactError(error) }));
  });
  if (deps.notifyEmail) {
    await deps.send(storeTeamMail(deps.notifyEmail, order, items, point)).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "warn", msg: "store_internal_notify_failed", orderId, error: redactError(error) }));
    });
  }
  return "sent";
}

/** Enlace nuevo de descarga (reenvío pedido por el cliente). */
export function storeDownloadResendMail(order: StoreOrder, downloads: DownloadInfo[]): Mail {
  const lines = [
    `Hola ${order.fullName}: aquí tienes un enlace nuevo para descargar tu compra del pedido ${order.orderNumber}.`,
    ...downloadLines(downloads),
    "Los enlaces anteriores que no se usaron ya no funcionan.",
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · Horario: ${business.hours}.`,
    "",
    "— inttimo —",
  ];
  return { to: order.email, subject: `Tu enlace de descarga · ${order.orderNumber}`, text: lines.join("\n"), html: toHtml(lines) };
}

export type DownloadResendResult = { status: "sent"; email: string } | { status: "not_found" | "unpaid" | "no_digital" | "failed"; message: string };

/**
 * Reenvía la descarga de un pedido pagado: enlace nuevo (los anteriores sin usar se revocan) al correo de la compra.
 * Lo usa el panel cuando el cliente lo pide por WhatsApp o correo.
 */
export async function resendStoreDownloads(
  db: Database,
  orderNumber: string,
  deps: { send: MailSender; siteUrl: string; actor: string },
): Promise<DownloadResendResult> {
  const order = await findStoreOrderByNumber(db, orderNumber.trim().toUpperCase());
  if (!order) return { status: "not_found", message: "No existe un pedido con ese folio." };
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") return { status: "unpaid", message: "Ese pedido no tiene un pago vigente." };
  const items = await listStoreOrderItems(db, order.id);
  if (!items.some((item) => item.digital)) return { status: "no_digital", message: "Ese pedido no tiene productos digitales." };
  try {
    const downloads = await issueDownloadLinks(db, order, items, deps.siteUrl, { source: "panel", actor: deps.actor });
    await deps.send(storeDownloadResendMail(order, downloads));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_download_resend_failed", orderId: order.id, error: redactError(error) }));
    return { status: "failed", message: "No se pudo enviar el correo. Inténtalo de nuevo en unos minutos." };
  }
  return { status: "sent", email: order.email };
}
