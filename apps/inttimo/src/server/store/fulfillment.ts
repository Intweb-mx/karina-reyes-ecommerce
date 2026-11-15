/*
 * Entrega de pedidos de la tienda: guía en SkyDropX, avisos al cliente y avisos de rastreo de la paquetería.
 * Misma regla que la preventa (Karina, 2026-10-02): guía generada ≠ enviado. El cliente recibe su guía cuando el paquete se
 * entrega a la paquetería.
 */
import {
  addStoreOrderEvent,
  findStoreOrderById,
  findStoreOrderByShipment,
  getStoreSettings,
  listStoreOrderItems,
  listStoreProducts,
  markStoreDelivered,
  markStoreHandedToCarrier,
  markStoreInTransit,
  markStoreLabelGenerated,
  saveStoreShipment,
  saveStoreTrackingUrlIfMissing,
  STORE_NOT_SHIPPED_STATUSES,
  type Database,
  type ShipmentDetails,
  type StoreOrder,
} from "@inttimo/database";
import type { MailSender } from "../presale/notifications.ts";
import { pickOptions } from "../presale/shipping.ts";
import type { ContactAddress, Shipment, ShippingProvider } from "../shipping/provider.ts";
import { redactError } from "./common.ts";
import { sendStoreOrderMail, storeShippedMail, type StoreMailOutcome } from "./notifications.ts";
import { cartParcel, parcelItems } from "./shipping.ts";

/** SkyDropX respeta la tarifa 24 h; con margen, después de esto se vuelve a cotizar al generar la guía. */
const RATE_VALID_HOURS = 23;

export type StoreLabelResult = { ok: true; status: "ready" | "pending"; message: string } | { ok: false; error: string };

const isPaid = (order: StoreOrder) => order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded";
const notShipped = (order: StoreOrder) => (STORE_NOT_SHIPPED_STATUSES as readonly string[]).includes(order.fulfillmentStatus);

/**
 * Compra la guía en SkyDropX para un pedido pagado con envío (descuenta saldo de la cuenta) y la deja lista para imprimir.
 * Usa la tarifa que eligió el cliente; si la cotización tiene más de 23 h se vuelve a cotizar con la misma paquetería y
 * servicio (o la más económica): la diferencia la absorbe inttimo, el cliente ya pagó. Si SkyDropX aún no entrega el número
 * de guía, queda el envío guardado y un segundo intento solo lo consulta (nunca compra dos guías).
 */
export async function generateStoreLabel(deps: { db: Database; provider: ShippingProvider | null; now?: () => Date }, orderId: string, actor: string): Promise<StoreLabelResult> {
  if (!deps.provider) return { ok: false, error: "SkyDropX no está configurado." };
  const order = await findStoreOrderById(deps.db, orderId);
  if (!order) return { ok: false, error: "Pedido no encontrado." };
  if (!isPaid(order)) return { ok: false, error: "Solo se generan guías de pedidos pagados." };
  if (order.deliveryMethod !== "shipping") return { ok: false, error: "Este pedido no lleva envío a domicilio." };
  if (order.trackingNumber) return { ok: false, error: "La guía ya está generada: imprímela y avisa cuando la entregues a la paquetería." };
  if (order.fulfillmentStatus !== "confirmed" && order.fulfillmentStatus !== "preparing") return { ok: false, error: "El pedido ya no está por enviar." };
  if (!order.deliveryAddress) return { ok: false, error: "El pedido no tiene dirección capturada: genera la guía en SkyDropX y regístrala aquí." };
  const profile = (await getStoreSettings(deps.db))?.shippingProfile;
  if (!profile) return { ok: false, error: "La tienda no tiene origen ni paquete configurados." };

  const now = deps.now?.() ?? new Date();
  const ctx = { source: "panel" as const, actor };
  const to: ContactAddress = { ...order.deliveryAddress, company: null, email: order.email };

  let shipment: Shipment;
  try {
    if (order.shipmentId) {
      shipment = await deps.provider.getShipment(order.shipmentId);
    } else {
      let { quotationId, rateId } = order.shippingSelection ?? { quotationId: "", rateId: "" };
      const quotedAt = order.shippingSelection ? new Date(order.shippingSelection.quotedAt) : new Date(0);
      if (!rateId || now.getTime() - quotedAt.getTime() > RATE_VALID_HOURS * 3_600_000) {
        const products = new Map((await listStoreProducts(deps.db)).map((product) => [product.id, product]));
        const items = (await listStoreOrderItems(deps.db, order.id)).filter((item) => !item.digital).flatMap((item) => {
          const product = products.get(item.productId);
          return product ? [{ product, quantity: item.quantity }] : [];
        });
        const fresh = await deps.provider.quote({ from: profile.origin, to, parcel: cartParcel(parcelItems(items, products), profile.parcel), carriers: profile.carriers });
        const same = fresh.rates.find((rate) => rate.carrier === order.shippingSelection?.carrier && rate.service === order.shippingSelection?.service);
        const chosen = same ?? pickOptions(fresh.rates, order.currency)[0];
        if (!chosen) return { ok: false, error: "SkyDropX no devolvió tarifas para esta dirección. Genera la guía en SkyDropX y regístrala aquí." };
        ({ quotationId, rateId } = { quotationId: fresh.quotationId, rateId: chosen.rateId });
      }
      shipment = await deps.provider.createShipment({ quotationId, rateId, from: profile.origin, to, consignmentNote: profile.consignmentNote, packageType: profile.packageType });
      await saveStoreShipment(deps.db, order.id, { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl }, ctx);
    }
  } catch (error) {
    const detail = redactError(error);
    console.error(JSON.stringify({ level: "error", msg: "store_label_failed", orderId: order.id, error: detail }));
    await addStoreOrderEvent(deps.db, order.id, "LABEL_FAILED", "panel", { actor, metadata: { error: detail } });
    return { ok: false, error: `SkyDropX no pudo generar la guía. Revisa el saldo y los datos, o inténtalo de nuevo. Detalle: ${detail}` };
  }

  if (!shipment.trackingNumber) {
    if (shipment.labelUrl) await saveStoreShipment(deps.db, order.id, { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl }, ctx);
    return { ok: true, status: "pending", message: "SkyDropX está generando la guía. Vuelve a presionar “Generar guía” en unos minutos para traer el número." };
  }

  await markStoreLabelGenerated(
    deps.db,
    order.id,
    { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl, carrier: shipment.carrier ?? order.shippingSelection?.carrier ?? "Paquetería", trackingNumber: shipment.trackingNumber },
    ctx,
  );
  return { ok: true, status: "ready", message: `Guía ${shipment.trackingNumber} lista. Imprímela y pégala en la caja; cuando entregues el paquete a la paquetería, márcalo como enviado.` };
}

export type HandOverResult = { ok: true; order: StoreOrder; email: StoreMailOutcome } | { ok: false; error: string };

/**
 * El paquete se entregó a la paquetería: marca el pedido como enviado y manda al cliente su número de guía. Con `shipment`
 * registra una guía hecha por fuera del panel.
 */
export async function handStoreOrderToCarrier(
  deps: { db: Database; send: MailSender },
  orderId: string,
  shipment: ShipmentDetails | null,
  ctx: { source: "panel" | "skydropx"; actor: string },
): Promise<HandOverResult> {
  const updated = await markStoreHandedToCarrier(deps.db, orderId, shipment, ctx);
  if (!updated) {
    const current = await findStoreOrderById(deps.db, orderId);
    if (!current) return { ok: false, error: "Pedido no encontrado." };
    if (!isPaid(current)) return { ok: false, error: "Solo se envían pedidos pagados." };
    if (current.deliveryMethod !== "shipping") return { ok: false, error: "Este pedido no lleva envío a domicilio." };
    if (notShipped(current) && !current.trackingNumber) return { ok: false, error: "Primero genera la guía o registra la que hiciste por fuera." };
    return { ok: false, error: "El pedido ya cambió de estado. Recarga la página." };
  }
  const items = await listStoreOrderItems(deps.db, updated.id);
  const email = await sendStoreOrderMail(deps.db, deps.send, updated, storeShippedMail(updated, items), "shipped", ctx.source);
  return { ok: true, order: updated, email };
}

// ---------- Avisos de rastreo de SkyDropX ----------

/** Estatus de SkyDropX que significan "el paquete ya está en manos de la paquetería". */
const IN_CARRIER_HANDS = new Set(["picked_up", "in_transit", "last_mile", "delivery_attempt", "delivered_to_branch"]);

export type StoreSkydropxOutcome = "ignored" | "unchanged" | "shipped" | "in_transit" | "delivered";

/**
 * Aviso de rastreo de un pedido de la tienda. "En camino" marca enviado (correo con la guía), después en tránsito o en
 * reparto, y "entregado" lo cierra. Idempotente y tolerante a avisos repetidos o fuera de orden: cada transición revisa el
 * estado actual y nunca regresa. Solo usa lo que informa la paquetería.
 */
export async function applyStoreSkydropxEvent(
  deps: { db: Database; send: MailSender },
  event: { status: string; shipmentId?: string | null; trackingNumber?: string | null; trackingUrl?: string | null },
): Promise<StoreSkydropxOutcome> {
  if (!IN_CARRIER_HANDS.has(event.status) && event.status !== "delivered") return "ignored";
  const order = await findStoreOrderByShipment(deps.db, { shipmentId: event.shipmentId, trackingNumber: event.trackingNumber });
  if (!order || order.deliveryMethod !== "shipping" || !isPaid(order)) return "ignored";
  if (event.trackingUrl?.startsWith("https://")) await saveStoreTrackingUrlIfMissing(deps.db, order.id, event.trackingUrl);

  const ctx = { source: "skydropx" as const, actor: "skydropx" };
  let outcome: StoreSkydropxOutcome = "unchanged";
  if (notShipped(order) && (await handStoreOrderToCarrier(deps, order.id, null, ctx)).ok) outcome = "shipped";
  if (event.status === "in_transit" && (await markStoreInTransit(deps.db, order.id, "in_transit", ctx))) outcome = "in_transit";
  if ((event.status === "last_mile" || event.status === "delivery_attempt") && (await markStoreInTransit(deps.db, order.id, "out_for_delivery", ctx))) outcome = "in_transit";
  if (event.status === "delivered" && (await markStoreDelivered(deps.db, order.id, ctx))) outcome = "delivered";
  return outcome;
}
