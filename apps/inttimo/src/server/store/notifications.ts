/*
 * Correos de pedidos de la tienda.
 * COPIA PENDIENTE DE APROBACIÓN DE KARINA (los textos de estos correos son funcionales, no aprobados): texto funcional que no promete envío ni guía (eso lo dirán los correos de
 * ENVIADO / LISTO PARA RECOGER que manda el panel, PR B).
 */
import {
  addStoreOrderEvent,
  claimStoreConfirmationEmail,
  getStoreSettings,
  listStoreOrderItems,
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
import type { StoreMismatch } from "./settlement.ts";

const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");

function addressText(order: StoreOrder): string | null {
  const a = order.deliveryAddress;
  return a ? [a.name, a.street, a.neighborhood, `${a.postalCode} ${a.city}`, a.state, a.reference ? `Ref.: ${a.reference}` : null].filter(Boolean).join(", ") : null;
}

function itemLines(order: StoreOrder, items: StoreOrderItem[]): string[] {
  return items.map((item) => `• ${item.name} × ${item.quantity}: ${formatMoney(item.unitAmount * item.quantity, order.currency)}`);
}

/** Pedido pagado, para el cliente. */
export function storeCustomerMail(order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const pickup = order.deliveryMethod === "pickup";
  const address = addressText(order);
  const lines = [
    `Hola ${order.fullName}: recibimos tu pago. Tu pedido ${order.orderNumber} está confirmado.`,
    "",
    ...itemLines(order, items),
    `Subtotal: ${money(order.subtotalAmount)}`,
    ...(order.discountAmount ? [`Descuento: −${money(order.discountAmount)}`] : []),
    `${pickup ? "Recolección" : "Envío"}: ${money(order.shippingAmount)}`,
    `Total pagado: ${money(order.totalAmount)}`,
    "",
    `Método de entrega: ${pickup ? "RECOLECCIÓN" : "ENVÍO A DOMICILIO"}`,
    ...(pickup && point ? [`Punto seleccionado: ${point.name}`] : []),
    ...(!pickup && address ? [`Dirección de entrega: ${address}`] : []),
    "",
    pickup ? "Te avisaremos por correo cuando tu pedido esté LISTO PARA RECOGER. Espera ese aviso antes de acudir." : "Te enviaremos la guía de rastreo por correo cuando tu pedido salga.",
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
    `Entrega: ${order.deliveryMethod === "pickup" ? `Recolección${point ? ` · ${point.name}` : ""}` : "Envío a domicilio"}`,
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
  deps: { send: MailSender; notifyEmail?: string | null },
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

  try {
    await deps.send(storeCustomerMail(order, items, point));
  } catch (error) {
    return giveUp("store_confirmation_failed", error, true);
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
