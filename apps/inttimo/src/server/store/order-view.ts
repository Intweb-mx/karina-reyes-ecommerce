import { getStoreSettings, listStoreOrderEvents, listStoreOrderItems, type Executor, type StoreOrder, type StoreOrderEventType } from "@inttimo/database";
import { getStoreProductContent } from "../../content/store-products.ts";
import type { FulfillmentStatus, Money, OrderView, TrackingEvent } from "../../lib/store/contract.ts";
import { maskEmail } from "../presale/reservations.ts";

/** Eventos del historial que ve el cliente. Solo hechos registrados (pago, panel, paquetería); nunca inventados. */
const VISIBLE_EVENTS: Partial<Record<StoreOrderEventType, { status: FulfillmentStatus; description: string }>> = {
  PAYMENT_APPROVED: { status: "confirmed", description: "Pedido confirmado" },
  LABEL_GENERATED: { status: "label_generated", description: "Guía generada" },
  READY_FOR_PICKUP: { status: "ready_for_pickup", description: "Listo para recoger" },
  HANDED_TO_CARRIER: { status: "handed_to_carrier", description: "Entregado a paquetería" },
  IN_TRANSIT: { status: "in_transit", description: "En tránsito" },
  OUT_FOR_DELIVERY: { status: "out_for_delivery", description: "En reparto" },
  DELIVERED: { status: "delivered", description: "Entregado" },
};

/** StoreOrder → OrderView del contrato (correo enmascarado; imágenes del archivo de contenido). */
export async function buildOrderView(db: Executor, order: StoreOrder): Promise<OrderView> {
  const items = await listStoreOrderItems(db, order.id);
  const events = await listStoreOrderEvents(db, order.id);
  const settings = await getStoreSettings(db);
  const money = (amount: number): Money => ({ amount, currency: order.currency });
  const point = order.pickupPointId ? settings?.pickupPoints.find((candidate) => candidate.id === order.pickupPointId) : undefined;
  const address = order.deliveryAddress;
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    lines: items.map((item) => {
      // El checkout solo vende productos con contenido; si falta aquí, es un error de despliegue (503 con log).
      const content = getStoreProductContent(item.productSlug);
      if (!content) throw new Error(`Producto sin contenido en content/store-products.ts: ${item.productSlug}`);
      return { name: item.name, image: content.image, quantity: item.quantity, unitPrice: money(item.unitAmount), subtotal: money(item.unitAmount * item.quantity) };
    }),
    subtotal: money(order.subtotalAmount),
    discount: order.discountAmount ? money(order.discountAmount) : null,
    shipping: money(order.shippingAmount),
    total: money(order.totalAmount),
    delivery: {
      method: order.deliveryMethod,
      pickupPoint: point ? { id: point.id, name: point.name, schedule: point.schedule } : null,
      address: address ? { name: address.name, line1: `${address.street}, ${address.neighborhood}`, city: address.city, state: address.state, postalCode: address.postalCode } : null,
    },
    email: maskEmail(order.email),
    shipment: order.carrier && order.trackingNumber ? { carrier: order.carrier, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, eta: null } : null,
    events: events.flatMap((event): TrackingEvent[] => {
      const visible = VISIBLE_EVENTS[event.type];
      return visible ? [{ at: event.createdAt.toISOString(), status: visible.status, description: visible.description, location: null }] : [];
    }),
  };
}
