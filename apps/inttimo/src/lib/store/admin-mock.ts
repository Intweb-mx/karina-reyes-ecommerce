/*
 * Panel de la tienda SIMULADO: datos de EJEMPLO en memoria del navegador para construir y revisar la UI
 * mientras el backend implementa /api/panel/tienda/*. Nada de esto es venta, cliente ni inventario real.
 * Los cambios (acciones, notas, inventario) se pierden al recargar la página.
 */
import type { Result } from "./api";
import type { StoreAdminApi } from "./admin";
import type {
  AdminLead,
  AdminOrderAction,
  AdminOrderDetail,
  AdminOrderFilter,
  AdminOrderSummary,
  AdminProduct,
  StockMovement,
} from "./admin-contract";
import type { FulfillmentStatus, Money, PaymentStatus } from "./contract";
import { getProductContent } from "@/content/products";

const MXN = (amount: number): Money => ({ amount, currency: "mxn" });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = () => new Date().toISOString();
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const notFound = { ok: false as const, error: { code: "not_found" as const, message: "No encontramos ese registro." } };

const content = getProductContent("uno-mas-uno")!;
const image = { ...content.thumbnail };
const PRICE = 50000;

const STEP_LABEL: Record<FulfillmentStatus, string> = {
  confirmed: "Pago recibido",
  preparing: "En preparación",
  label_generated: "Guía generada",
  ready_for_pickup: "Listo para recoger",
  handed_to_carrier: "Entregado a paquetería",
  in_transit: "En tránsito",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  exception: "Incidencia reportada",
};

type Seed = { n: number; name: string; units: number; method: "shipping" | "pickup"; status: FulfillmentStatus; payment?: PaymentStatus; hoursAgo: number };
const seeds: Seed[] = [
  { n: 1, name: "Cliente EJEMPLO A", units: 1, method: "shipping", status: "confirmed", hoursAgo: 80 },
  { n: 2, name: "Cliente EJEMPLO B", units: 2, method: "shipping", status: "confirmed", hoursAgo: 26 },
  { n: 3, name: "Cliente EJEMPLO C", units: 1, method: "pickup", status: "confirmed", hoursAgo: 50 },
  { n: 4, name: "Cliente EJEMPLO D", units: 1, method: "shipping", status: "label_generated", hoursAgo: 30 },
  { n: 5, name: "Cliente EJEMPLO E", units: 3, method: "shipping", status: "in_transit", hoursAgo: 72 },
  { n: 6, name: "Cliente EJEMPLO F", units: 1, method: "pickup", status: "ready_for_pickup", hoursAgo: 96 },
  { n: 7, name: "Cliente EJEMPLO G", units: 1, method: "shipping", status: "exception", hoursAgo: 120 },
  { n: 8, name: "Cliente EJEMPLO H", units: 2, method: "shipping", status: "delivered", hoursAgo: 300 },
  { n: 9, name: "Cliente EJEMPLO I", units: 1, method: "shipping", status: "confirmed", payment: "pending", hoursAgo: 3 },
];

function allowedActions(order: Pick<AdminOrderDetail, "paymentStatus" | "fulfillmentStatus" | "delivery">): AdminOrderAction[] {
  const { paymentStatus: pay, fulfillmentStatus: status, delivery } = order;
  if (pay === "pending" || pay === "failed") return ["cancel"];
  if (pay !== "paid") return [];
  if (status === "delivered") return ["resend_confirmation"];
  if (status === "exception") return ["mark_delivered", "cancel"];
  if (delivery.method === "pickup") return status === "ready_for_pickup" ? ["mark_delivered", "report_exception"] : ["mark_ready_for_pickup", "resend_confirmation", "cancel"];
  if (status === "confirmed" || status === "preparing") return ["generate_label", "report_exception", "resend_confirmation", "cancel"];
  if (status === "label_generated") return ["mark_shipped", "report_exception", "cancel"];
  return ["mark_delivered", "report_exception"];
}

function build(seed: Seed): AdminOrderDetail {
  const orderNumber = `INT-EJEMPLO-${String(seed.n).padStart(4, "0")}`;
  const shipping = seed.method === "shipping" ? MXN(18900) : MXN(0);
  const subtotal = MXN(PRICE * seed.units);
  const created = ago(seed.hoursAgo);
  const paid = (seed.payment ?? "paid") === "paid";
  const flow: FulfillmentStatus[] = seed.method === "pickup" ? ["confirmed", "ready_for_pickup", "delivered"] : ["confirmed", "label_generated", "handed_to_carrier", "in_transit", "delivered"];
  const reached = seed.status === "exception" ? ["confirmed", "label_generated", "handed_to_carrier", "exception"] : flow.slice(0, flow.indexOf(seed.status) + 1);
  const events = paid
    ? reached.map((status, index) => ({ at: ago(seed.hoursAgo - index * 6), status: status as FulfillmentStatus, description: STEP_LABEL[status as FulfillmentStatus], location: null }))
    : [];
  const order: AdminOrderDetail = {
    orderNumber,
    createdAt: created,
    paymentStatus: seed.payment ?? "paid",
    fulfillmentStatus: seed.status,
    lines: [{ name: "UNO+UNO", image, quantity: seed.units, unitPrice: MXN(PRICE), subtotal }],
    subtotal,
    discount: null,
    shipping,
    total: MXN(subtotal.amount + shipping.amount),
    delivery:
      seed.method === "shipping"
        ? { method: "shipping", pickupPoint: null, address: { name: seed.name, line1: "Calle de EJEMPLO 123, Colonia de EJEMPLO", city: "Chihuahua", state: "Chihuahua", postalCode: "31000" } }
        : { method: "pickup", address: null, pickupPoint: { id: "sophos-baluarte", name: "Librería Sophos · Iglesia Baluarte", schedule: "Domingos de 10:00 a.m. a 2:00 p.m." } },
    email: `cliente${seed.n}@ejemplo.com`,
    shipment: ["label_generated", "handed_to_carrier", "in_transit", "exception", "delivered"].includes(seed.status) && seed.method === "shipping" ? { carrier: "Paquetería de EJEMPLO", trackingNumber: `EJEMPLO${100000 + seed.n}`, trackingUrl: null, eta: null } : null,
    events,
    customerName: seed.name,
    phone: "614 000 0000",
    marketingConsent: seed.n % 2 === 0,
    labelUrl: null,
    allowedActions: [],
    notes: seed.status === "exception" ? [{ at: ago(10), author: "equipo@ejemplo.com", text: "La paquetería reporta domicilio no localizado (EJEMPLO)." }] : [],
    timeline: [
      { at: created, type: "ORDER_CREATED", label: "Pedido creado", actor: null, note: null },
      ...(paid ? [{ at: ago(seed.hoursAgo - 0.1), type: "PAYMENT_APPROVED", label: "Pago recibido (Stripe)", actor: null, note: null }] : [{ at: ago(seed.hoursAgo - 0.1), type: "PAYMENT_PENDING", label: "Esperando pago", actor: null, note: null }]),
      ...events.slice(1).map((event) => ({ at: event.at, type: event.status.toUpperCase(), label: event.description, actor: null, note: null })),
    ],
  };
  order.allowedActions = allowedActions(order);
  return order;
}

const orders: AdminOrderDetail[] = seeds.map(build);

const products: AdminProduct[] = [
  {
    id: "prod_uno_mas_uno",
    slug: "uno-mas-uno",
    name: "UNO+UNO",
    sku: null,
    status: "available",
    published: true,
    price: MXN(PRICE),
    image,
    maxQuantityPerOrder: 10,
    inventory: { onHand: 40, reserved: 3, available: 37, lowStockThreshold: 15 },
    updatedAt: ago(5),
  },
];

const movements: Record<string, StockMovement[]> = {
  prod_uno_mas_uno: [
    { id: "mov_1", at: ago(240), deltaOnHand: 50, deltaReserved: 0, reason: "reception", actor: "equipo@ejemplo.com", orderNumber: null, note: "Recepción de EJEMPLO" },
    { id: "mov_2", at: ago(72), deltaOnHand: -3, deltaReserved: -3, reason: "sale", actor: null, orderNumber: "INT-EJEMPLO-0005", note: null },
    { id: "mov_3", at: ago(26), deltaOnHand: -2, deltaReserved: -2, reason: "sale", actor: null, orderNumber: "INT-EJEMPLO-0002", note: null },
  ],
};

const leads: AdminLead[] = [
  { id: "lead_1", kind: "church", createdAt: ago(20), name: "Contacto EJEMPLO", organization: "Iglesia de EJEMPLO", email: "contacto@ejemplo.com", phone: "614 000 0000", city: "Chihuahua", topic: "Retiro matrimonial", quantity: 40, eventDate: ago(-24 * 30).slice(0, 10), orderNumber: null, message: "Mensaje de EJEMPLO: buscamos juegos para un retiro de parejas.", status: "new", notes: "" },
  { id: "lead_2", kind: "contact", createdAt: ago(6), name: "Cliente EJEMPLO B", organization: null, email: "cliente2@ejemplo.com", phone: null, city: null, topic: "Mi pedido", quantity: null, eventDate: null, orderNumber: "INT-EJEMPLO-0002", message: "Mensaje de EJEMPLO: ¿cuándo sale mi pedido?", status: "new", notes: "" },
  { id: "lead_3", kind: "church", createdAt: ago(200), name: "Contacto EJEMPLO 2", organization: "Ministerio de EJEMPLO", email: "ministerio@ejemplo.com", phone: null, city: "Juárez", topic: "Grupos de parejas", quantity: 15, eventDate: null, orderNumber: null, message: "Mensaje de EJEMPLO.", status: "contacted", notes: "Se envió información por correo (EJEMPLO)." },
];

function summary(order: AdminOrderDetail): AdminOrderSummary {
  const waiting = order.paymentStatus === "paid" && ["confirmed", "preparing", "label_generated"].includes(order.fulfillmentStatus);
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: order.customerName,
    email: order.email,
    units: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    total: order.total,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryMethod: order.delivery.method,
    waitingSince: waiting ? order.createdAt : null,
  };
}

const MATCH: Record<AdminOrderFilter, (o: AdminOrderDetail) => boolean> = {
  all: () => true,
  to_ship: (o) => o.paymentStatus === "paid" && o.delivery.method === "shipping" && ["confirmed", "preparing", "label_generated"].includes(o.fulfillmentStatus),
  to_pickup: (o) => o.paymentStatus === "paid" && o.delivery.method === "pickup" && ["confirmed", "preparing"].includes(o.fulfillmentStatus),
  in_transit: (o) => o.paymentStatus === "paid" && ["handed_to_carrier", "in_transit", "out_for_delivery", "ready_for_pickup"].includes(o.fulfillmentStatus),
  delivered: (o) => o.fulfillmentStatus === "delivered",
  exception: (o) => o.fulfillmentStatus === "exception",
  unpaid: (o) => o.paymentStatus === "pending" || o.paymentStatus === "failed",
};

const ACTION_RESULT: Record<AdminOrderAction, { label: string; apply: (o: AdminOrderDetail) => void }> = {
  generate_label: {
    label: "Guía generada",
    apply: (o) => {
      o.fulfillmentStatus = "label_generated";
      o.shipment = { carrier: "Paquetería de EJEMPLO", trackingNumber: `EJEMPLO${Math.floor(Math.random() * 900000 + 100000)}`, trackingUrl: null, eta: null };
    },
  },
  mark_shipped: { label: "Marcado como enviado", apply: (o) => void (o.fulfillmentStatus = "handed_to_carrier") },
  mark_ready_for_pickup: { label: "Marcado listo para recoger (se avisó al cliente)", apply: (o) => void (o.fulfillmentStatus = "ready_for_pickup") },
  mark_delivered: { label: "Marcado como entregado", apply: (o) => void (o.fulfillmentStatus = "delivered") },
  report_exception: { label: "Incidencia reportada", apply: (o) => void (o.fulfillmentStatus = "exception") },
  resend_confirmation: { label: "Correo de confirmación reenviado", apply: () => undefined },
  cancel: { label: "Pedido cancelado", apply: (o) => void (o.paymentStatus = o.paymentStatus === "paid" ? "refunded" : "cancelled") },
};

export const mockStoreAdminApi: StoreAdminApi = {
  mode: "mock",
  async dashboard(period) {
    await wait();
    const since = period === "7d" ? Date.now() - 7 * 86_400_000 : period === "30d" ? Date.now() - 30 * 86_400_000 : 0;
    const paid = orders.filter((o) => o.paymentStatus === "paid" && new Date(o.createdAt).getTime() >= since);
    const sales = paid.reduce((sum, o) => sum + o.total.amount, 0);
    const units = paid.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.quantity, 0), 0);
    return ok({
      period,
      sales: MXN(sales),
      orders: paid.length,
      averageTicket: paid.length ? MXN(Math.round(sales / paid.length)) : null,
      toShip: orders.filter(MATCH.to_ship).length,
      toPickup: orders.filter(MATCH.to_pickup).length,
      exceptions: orders.filter(MATCH.exception).length,
      lowStock: products.filter((p) => p.inventory.available <= p.inventory.lowStockThreshold).length,
      newLeads: leads.filter((l) => l.status === "new").length,
      topProducts: units ? [{ name: "UNO+UNO", units }] : [],
    });
  },
  async orders({ filter, search }) {
    await wait();
    const q = search?.trim().toLowerCase();
    const matches = (o: AdminOrderDetail) => !q || [o.orderNumber, o.customerName, o.email, o.shipment?.trackingNumber ?? ""].some((v) => v.toLowerCase().includes(q));
    const counts = Object.fromEntries(Object.entries(MATCH).map(([key, fn]) => [key, orders.filter((o) => fn(o) && matches(o)).length])) as Record<AdminOrderFilter, number>;
    const list = orders.filter((o) => MATCH[filter](o) && matches(o)).map(summary);
    // Lo que espera acción va primero (el más antiguo arriba); el resto, del más reciente al más antiguo.
    list.sort((a, b) => (a.waitingSince && b.waitingSince ? a.waitingSince.localeCompare(b.waitingSince) : a.waitingSince ? -1 : b.waitingSince ? 1 : b.createdAt.localeCompare(a.createdAt)));
    return ok({ orders: list, total: list.length, pageSize: 50, counts });
  },
  async order(orderNumber) {
    await wait();
    const order = orders.find((o) => o.orderNumber === orderNumber);
    return order ? ok(clone(order)) : notFound;
  },
  async orderAction(orderNumber, { action, note }) {
    await wait(600);
    const order = orders.find((o) => o.orderNumber === orderNumber);
    if (!order) return notFound;
    if (!order.allowedActions.includes(action)) return { ok: false, error: { code: "validation_error", message: "Esa acción ya no está disponible para este pedido. Recarga la página." } };
    const result = ACTION_RESULT[action];
    result.apply(order);
    order.timeline.push({ at: now(), type: action.toUpperCase(), label: result.label, actor: "tú (simulación)", note: note ?? null });
    if (action !== "resend_confirmation" && action !== "cancel") order.events.push({ at: now(), status: order.fulfillmentStatus, description: STEP_LABEL[order.fulfillmentStatus], location: null });
    order.allowedActions = allowedActions(order);
    return ok(clone(order));
  },
  async addOrderNote(orderNumber, { text }) {
    await wait();
    const order = orders.find((o) => o.orderNumber === orderNumber);
    if (!order) return notFound;
    order.notes.push({ at: now(), author: "tú (simulación)", text });
    return ok(clone(order));
  },
  exportOrdersUrl: () => null,
  async products() {
    await wait();
    return ok({ products: clone(products) });
  },
  async updateProduct(id, request) {
    await wait(400);
    const product = products.find((p) => p.id === id);
    if (!product) return notFound;
    if (request.price !== undefined) product.price = MXN(request.price);
    if (request.published !== undefined) product.published = request.published;
    if (request.lowStockThreshold !== undefined) product.inventory.lowStockThreshold = request.lowStockThreshold;
    if (request.maxQuantityPerOrder !== undefined) product.maxQuantityPerOrder = request.maxQuantityPerOrder;
    product.updatedAt = now();
    return ok(clone(product));
  },
  async adjustStock(id, { delta, reason, note }) {
    await wait(400);
    const product = products.find((p) => p.id === id);
    if (!product) return notFound;
    if (product.inventory.onHand + delta < product.inventory.reserved) return { ok: false, error: { code: "validation_error", message: "Las existencias no pueden quedar por debajo de lo apartado en pedidos." } };
    product.inventory.onHand += delta;
    product.inventory.available = product.inventory.onHand - product.inventory.reserved;
    product.status = product.inventory.available <= 0 ? "sold_out" : product.inventory.available <= product.inventory.lowStockThreshold ? "low_stock" : "available";
    product.updatedAt = now();
    (movements[id] ??= []).push({ id: `mov_${Date.now()}`, at: now(), deltaOnHand: delta, deltaReserved: 0, reason, actor: "tú (simulación)", orderNumber: null, note: note ?? null });
    return ok(clone(product));
  },
  async stockMovements(id) {
    await wait();
    return ok({ movements: clone(movements[id] ?? []).reverse() });
  },
  async leads() {
    await wait();
    return ok({ leads: clone(leads) });
  },
  async updateLead(id, request) {
    await wait(350);
    const lead = leads.find((l) => l.id === id);
    if (!lead) return notFound;
    Object.assign(lead, request);
    return ok(clone(lead));
  },
};
