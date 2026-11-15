import { createStoreOrder, findStoreOrderById, listStoreOrderEvents, markStoreOrderPaid, markStoreOrderPaymentMismatch, type Database, type NewStoreOrder, type StoreOrder } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjustAdminStock,
  exportAdminOrders,
  getAdminDashboard,
  getAdminOrder,
  listAdminOrders,
  listAdminProducts,
  listAdminStockMovements,
  parseOrdersQuery,
  runAdminOrderAction,
  updateAdminProduct,
  type StoreAdminActor,
  type StoreAdminDeps,
} from "../src/server/store/admin.ts";
import { applyStoreSkydropxEvent } from "../src/server/store/fulfillment.ts";
import { FakeGateway, FakeShipping } from "./helpers.ts";
import { inventoryOf, pickupOrderFor, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let sent: Mail[];
let mailFails: boolean;
let audited: { action: string; metadata?: Record<string, unknown> }[];
let productId: string;
let deps: StoreAdminDeps;
let actor: StoreAdminActor;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  sent = [];
  mailFails = false;
  audited = [];
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  deps = {
    db,
    gateway,
    shipping,
    send: async (mail) => {
      if (mailFails) throw new Error("correo caído a ana@ejemplo.com");
      sent.push(mail);
    },
  };
  actor = { email: "equipo@inttimo.test", audit: async (entry) => void audited.push(entry) };
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const selection = () => ({ provider: "skydropx" as const, quotationId: "quo_cliente", rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: new Date().toISOString() });
const shippingOrder = (quantity = 1, overrides: Partial<NewStoreOrder> = {}) =>
  pickupOrderFor(productId, quantity, { contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: "6141234567" }, delivery: { method: "shipping", address: { ...SHIP_ADDRESS, reference: null }, selection: selection() }, shippingAmount: 18_000, ...overrides });

async function paid(input: NewStoreOrder): Promise<StoreOrder> {
  const { order } = await createStoreOrder(db, input);
  return (await markStoreOrderPaid(db, order.id, { paymentIntentId: `pi_${order.orderNumber}` }, { source: "stripe" }))!.order;
}
const act = (order: StoreOrder, body: Record<string, unknown>) => runAdminOrderAction(deps, order.orderNumber, body, actor);
const dataOf = <T,>(result: { ok: true; data: T } | { ok: false; body: unknown }): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  return result.data;
};
const events = async (order: StoreOrder) => (await listStoreOrderEvents(db, order.id)).map((event) => event.type);

describe("pedido con envío", () => {
  it("genera la guía con la tarifa del cliente, sin avisarle, y al entregar a la paquetería le manda su guía", async () => {
    const order = await paid(shippingOrder(2));
    const detail = dataOf(await getAdminOrder(deps, order.orderNumber, actor));
    expect(detail).toMatchObject({ email: "ana@ejemplo.com", customerName: "Ana Pérez", phone: "6141234567" });
    expect(detail.allowedActions).toEqual(["generate_label", "register_shipment", "report_exception", "resend_confirmation", "cancel"]);

    const labelled = dataOf(await act(order, { action: "generate_label" }));
    expect(shipping.shipments).toHaveLength(1);
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_cliente", rateId: "rate_eco", to: { name: "Ana Pérez", postalCode: SHIP_ADDRESS.postalCode, email: "ana@ejemplo.com" } });
    expect(shipping.quotes).toHaveLength(0);
    expect(labelled).toMatchObject({ fulfillmentStatus: "label_generated", labelUrl: "https://etiquetas.test/1.pdf", shipment: { carrier: "Estafeta", trackingNumber: "GUIA123" }, notice: { tone: "ok" } });
    expect(labelled.allowedActions[0]).toBe("mark_shipped");
    expect(sent).toHaveLength(0);

    // Repetir "generar guía" no compra otra.
    expect((await act(order, { action: "generate_label" })).status).toBe(409);
    expect(shipping.shipments).toHaveLength(1);

    const shipped = dataOf(await act(order, { action: "mark_shipped" }));
    expect(shipped).toMatchObject({ fulfillmentStatus: "handed_to_carrier", notice: { tone: "ok" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ana@ejemplo.com" });
    expect(sent[0]!.text).toContain("GUIA123");
    expect(shipped.allowedActions).toEqual(["mark_delivered", "report_exception", "resend_confirmation"]);

    expect(dataOf(await act(order, { action: "mark_delivered" }))).toMatchObject({ fulfillmentStatus: "delivered", allowedActions: ["resend_confirmation"] });
    expect(await events(order)).toEqual(expect.arrayContaining(["SHIPMENT_CREATED", "LABEL_GENERATED", "HANDED_TO_CARRIER", "FULFILLMENT_EMAIL_SENT", "DELIVERED"]));
    expect(audited.map((entry) => entry.action)).toEqual(expect.arrayContaining(["store_order.view", "store_order.generate_label", "store_order.mark_shipped", "store_order.mark_delivered"]));
  });

  it("con la cotización vencida vuelve a cotizar el paquete del pedido y usa la misma paquetería", async () => {
    const old = { ...selection(), quotedAt: new Date(Date.now() - 30 * 3_600_000).toISOString() };
    const order = await paid(shippingOrder(2, { delivery: { method: "shipping", address: { ...SHIP_ADDRESS, reference: null }, selection: old } }));
    dataOf(await act(order, { action: "generate_label" }));
    expect(shipping.quotes).toHaveLength(1);
    expect(shipping.quotes[0]!.parcel).toMatchObject({ weightKg: 2, heightCm: 22 });
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_1", rateId: "rate_eco" });
  });

  it("si SkyDropX aún no da el número, el segundo intento consulta el mismo envío", async () => {
    shipping.tracking = null;
    const order = await paid(shippingOrder());
    const pending = dataOf(await act(order, { action: "generate_label" }));
    expect(pending).toMatchObject({ fulfillmentStatus: "confirmed", shipment: null });
    expect(pending.notice?.text).toContain("generando la guía");
    expect(dataOf(await act(order, { action: "generate_label" }))).toMatchObject({ fulfillmentStatus: "label_generated" });
    expect(shipping.shipments).toHaveLength(1);
  });

  it("un fallo de SkyDropX no cambia el pedido y queda en el historial", async () => {
    shipping.fail = true;
    const order = await paid(shippingOrder());
    const result = await act(order, { action: "generate_label" });
    expect(result).toMatchObject({ ok: false, status: 502 });
    expect((await findStoreOrderById(db, order.id))?.fulfillmentStatus).toBe("confirmed");
    expect(await events(order)).toContain("LABEL_FAILED");
  });

  it("registra una guía hecha por fuera; si el correo falla lo dice y no lo reporta como éxito", async () => {
    const order = await paid(shippingOrder());
    expect((await act(order, { action: "register_shipment" })).status).toBe(400);
    expect((await act(order, { action: "register_shipment", shipment: { carrier: "DHL", trackingNumber: "M1", trackingUrl: "http://inseguro.test" } })).status).toBe(400);
    mailFails = true;
    const result = dataOf(await act(order, { action: "register_shipment", shipment: { carrier: "DHL", trackingNumber: "MANUAL1" } }));
    expect(result).toMatchObject({ fulfillmentStatus: "handed_to_carrier", shipment: { carrier: "DHL", trackingNumber: "MANUAL1" }, notice: { tone: "error" } });
    const failed = (await listStoreOrderEvents(db, order.id)).find((event) => event.type === "FULFILLMENT_EMAIL_FAILED");
    expect(JSON.stringify(failed?.metadata)).not.toContain("ana@ejemplo.com");
  });

  it("los avisos de SkyDropX avanzan el pedido una sola vez y nunca lo regresan", async () => {
    const order = await paid(shippingOrder());
    dataOf(await act(order, { action: "generate_label" }));
    const event = (status: string) => applyStoreSkydropxEvent(deps, { status, shipmentId: "shp_1", trackingNumber: "GUIA123", trackingUrl: "https://rastreo.test/GUIA123" });
    expect(await event("created")).toBe("ignored");
    expect(await event("picked_up")).toBe("shipped");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("https://rastreo.test/GUIA123");
    expect(await event("picked_up")).toBe("unchanged");
    expect(await event("in_transit")).toBe("in_transit");
    expect(await event("delivered")).toBe("delivered");
    expect(await event("in_transit")).toBe("unchanged");
    expect(sent).toHaveLength(1);
    expect((await findStoreOrderById(db, order.id))?.fulfillmentStatus).toBe("delivered");
    expect(await applyStoreSkydropxEvent(deps, { status: "delivered", shipmentId: "otro", trackingNumber: "NO-EXISTE" })).toBe("ignored");
  });
});

describe("recolección e incidencias", () => {
  it("avisa que está listo con el punto elegido y luego se entrega", async () => {
    const order = await paid(pickupOrderFor(productId, 1));
    expect(dataOf(await getAdminOrder(deps, order.orderNumber, actor)).allowedActions).toEqual(["mark_ready_for_pickup", "report_exception", "resend_confirmation", "cancel"]);
    const ready = dataOf(await act(order, { action: "mark_ready_for_pickup" }));
    expect(ready.fulfillmentStatus).toBe("ready_for_pickup");
    expect(sent[0]!.text).toContain("Costco Chihuahua");
    expect((await act(order, { action: "mark_ready_for_pickup" })).status).toBe(409);
    expect(dataOf(await act(order, { action: "mark_delivered" })).fulfillmentStatus).toBe("delivered");
  });

  it("una incidencia pausa el pedido con su nota y se puede resolver", async () => {
    const order = await paid(pickupOrderFor(productId, 1));
    const paused = dataOf(await act(order, { action: "report_exception", note: "El cliente no contesta" }));
    expect(paused).toMatchObject({ fulfillmentStatus: "exception", allowedActions: ["resolve_exception", "cancel"] });
    expect(paused.timeline.at(-1)).toMatchObject({ label: "Incidencia reportada por el equipo", note: "El cliente no contesta", actor: "equipo@inttimo.test" });
    expect(dataOf(await act(order, { action: "resolve_exception" })).fulfillmentStatus).toBe("confirmed");
  });

  it("una acción que no cabe en el estado se rechaza", async () => {
    const order = await paid(pickupOrderFor(productId, 1));
    expect(await act(order, { action: "mark_shipped" })).toMatchObject({ ok: false, status: 409 });
    expect(await act(order, { action: "borrar" })).toMatchObject({ ok: false, status: 400 });
    expect((await runAdminOrderAction(deps, "INT-0000000000", { action: "cancel" }, actor)).status).toBe(404);
    expect((await runAdminOrderAction(deps, "'; drop table", { action: "cancel" }, actor)).status).toBe(404);
  });
});

describe("cancelar", () => {
  it("pagado: reembolsa en Stripe una vez, devuelve las piezas y avisa al cliente", async () => {
    const order = await paid(shippingOrder(2));
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 18, reserved: 0 });
    const cancelled = dataOf(await act(order, { action: "cancel", note: "Lo pidió el cliente" }));
    expect(gateway.refunds).toEqual([{ paymentIntentId: `pi_${order.orderNumber}`, idempotencyKey: `store-cancel-${order.id}` }]);
    expect(cancelled).toMatchObject({ paymentStatus: "refunded", allowedActions: [], notice: { tone: "ok" } });
    expect(cancelled.notice?.text).toContain("volvieron al inventario");
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain("cancelado");
    expect(sent[0]!.text).toContain("$1,180.00");
    expect((await findStoreOrderById(db, order.id))?.amountRefunded).toBe(order.totalAmount);

    expect((await act(order, { action: "cancel" })).status).toBe(409);
    expect(gateway.refunds).toHaveLength(1);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("si Stripe no reembolsa, el pedido no se cancela ni cambia el inventario", async () => {
    const order = await paid(pickupOrderFor(productId, 1));
    gateway.refundFail = true;
    expect(await act(order, { action: "cancel" })).toMatchObject({ ok: false, status: 502 });
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ paymentStatus: "paid", amountRefunded: 0 });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 19, reserved: 0 });
    expect(sent).toHaveLength(0);
  });

  it("sin pagar: libera lo apartado, cierra la página de pago y no manda correo ni reembolso", async () => {
    const { order } = await createStoreOrder(db, pickupOrderFor(productId, 3));
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 3 });
    expect(dataOf(await act(order, { action: "cancel" }))).toMatchObject({ paymentStatus: "cancelled", allowedActions: [] });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
    expect(gateway.refunds).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("un cobro con monto distinto se devuelve y el pedido se cierra", async () => {
    const { order } = await createStoreOrder(db, pickupOrderFor(productId, 1));
    await markStoreOrderPaymentMismatch(db, order.id, { paymentIntentId: "pi_raro", expected: { amount: 50_000, currency: "mxn" }, received: { amount: 100, currency: "mxn" } }, { source: "stripe" });
    const stuck = (await findStoreOrderById(db, order.id))!;
    expect(dataOf(await getAdminOrder(deps, order.orderNumber, actor)).allowedActions).toEqual(["cancel"]);
    expect(dataOf(await act(stuck, { action: "cancel" }))).toMatchObject({ paymentStatus: "cancelled" });
    expect(gateway.refunds[0]?.paymentIntentId).toBe("pi_raro");
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("ya enviado no se puede cancelar desde el panel", async () => {
    const order = await paid(shippingOrder());
    dataOf(await act(order, { action: "register_shipment", shipment: { carrier: "DHL", trackingNumber: "M1" } }));
    expect((await act(order, { action: "cancel" })).status).toBe(409);
    expect(gateway.refunds).toHaveLength(0);
  });
});

describe("lista, resumen y exportación", () => {
  it("lista con conteos, resumen del periodo y CSV sin fórmulas", async () => {
    await paid(shippingOrder(2, { contact: { fullName: "=HYPERLINK(1)", email: "ana@ejemplo.com", phone: null } }));
    await paid(pickupOrderFor(productId, 1));
    const list = dataOf(await listAdminOrders(deps, parseOrdersQuery(new URLSearchParams("filtro=to_ship"))));
    expect(list).toMatchObject({ total: 1, pageSize: 50, counts: { all: 2, to_ship: 1, to_pickup: 1 } });
    expect(list.orders[0]).toMatchObject({ units: 2, total: { amount: 118_000, currency: "mxn" }, deliveryMethod: "shipping" });
    expect(list.orders[0]!.waitingSince).not.toBeNull();
    expect(parseOrdersQuery(new URLSearchParams("filtro=xx&pagina=-3"))).toMatchObject({ filter: "all", page: 1 });

    const dashboard = dataOf(await getAdminDashboard(deps, "7d"));
    expect(dashboard).toMatchObject({ period: "7d", orders: 2, sales: { amount: 168_000 }, averageTicket: { amount: 84_000 }, toShip: 1, toPickup: 1, newLeads: 0, topProducts: [{ name: "UNO+UNO", units: 3 }] });
    expect(dataOf(await getAdminDashboard(deps, "raro")).period).toBe("30d");

    const { csv, rows } = await exportAdminOrders(deps, parseOrdersQuery(new URLSearchParams()));
    expect(rows).toBe(2);
    expect(csv.startsWith("﻿\"Folio\"")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(1)\"");
  });
});

describe("productos e inventario", () => {
  it("edita precio y publicación dejando el cambio en la bitácora", async () => {
    const [product] = dataOf(await listAdminProducts(deps)).products;
    expect(product).toMatchObject({ slug: "uno-mas-uno", type: "physical", bundleOf: null, price: { amount: 50_000 }, inventory: { onHand: 20, reserved: 0, available: 20 } });
    const updated = dataOf(await updateAdminProduct(deps, productId, { price: 54_900, published: false }, actor));
    expect(updated).toMatchObject({ price: { amount: 54_900 }, published: false });
    expect(audited.at(-1)).toMatchObject({ action: "store_product.update", metadata: { changes: { price: { from: 50_000, to: 54_900 }, published: { from: true, to: false } } } });
    expect((await updateAdminProduct(deps, productId, { price: 0.5 }, actor)).status).toBe(400);
    expect((await updateAdminProduct(deps, productId, { saleStatus: "on_sale" }, actor)).status).toBe(400);
    expect((await updateAdminProduct(deps, "no-es-id", { price: 100 }, actor)).status).toBe(404);
  });

  it("ajusta existencias con movimiento auditable y respeta lo apartado; un paquete se ajusta en su producto base", async () => {
    const duo = await seedStoreProduct(db, { slug: "uno-mas-uno-duo", name: "Dúo", stock: 0, stockProductId: productId, stockUnits: 2, price: 90_000 });
    await createStoreOrder(db, pickupOrderFor(productId, 3));
    expect(dataOf(await adjustAdminStock(deps, productId, { delta: 5, reason: "reception", note: "2 cajas" }, actor)).inventory).toMatchObject({ onHand: 25, reserved: 3, available: 22 });
    expect(await adjustAdminStock(deps, productId, { delta: -23, reason: "damage" }, actor)).toMatchObject({ ok: false, status: 409 });
    expect(await adjustAdminStock(deps, duo.id, { delta: 1, reason: "reception" }, actor)).toMatchObject({ ok: false, status: 409 });
    expect((await adjustAdminStock(deps, productId, { delta: 1.5, reason: "reception" }, actor)).status).toBe(400);

    const bundle = dataOf(await listAdminProducts(deps)).products.find((item) => item.id === duo.id);
    expect(bundle).toMatchObject({ bundleOf: { name: "UNO+UNO", units: 2 }, inventory: { onHand: 25, reserved: 3, available: 11 } });
    const movements = dataOf(await listAdminStockMovements(deps, duo.id)).movements;
    expect(movements[0]).toMatchObject({ reason: "reception", deltaOnHand: 5, actor: "equipo@inttimo.test", note: "2 cajas" });
  });
});
