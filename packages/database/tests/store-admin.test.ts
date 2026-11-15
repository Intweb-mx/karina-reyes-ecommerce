import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  cancelStoreOrder,
  getStoreDashboard,
  markStoreDelivered,
  markStoreHandedToCarrier,
  markStoreInTransit,
  markStoreLabelGenerated,
  markStoreReadyForPickup,
  reportStoreException,
  resolveStoreException,
  searchStoreOrders,
  updateStoreProductSettings,
} from "../src/store-admin.ts";
import { applyStoreRefund, createStoreOrder, findStoreOrderById, listStockMovements, listStoreOrderEvents, markStoreOrderPaid, type NewStoreOrder } from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(() => close());

const panel = { source: "panel" as const, actor: "equipo@inttimo.test" };
const ADDRESS = { name: "Ana Pérez", phone: "6141234567", street: "Av. Reforma 100", neighborhood: "Juárez", city: "Cuauhtémoc", state: "Ciudad de México", postalCode: "06600", reference: null };
const shippingOrder = (lines: NewStoreOrder["lines"]): NewStoreOrder =>
  pickupOrder(lines, {
    delivery: { method: "shipping", address: ADDRESS, selection: { provider: "skydropx", quotationId: "quo_1", rateId: "rate_1", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: new Date().toISOString() } },
    shippingAmount: 18_000,
  });

async function paid(input: NewStoreOrder) {
  const { order } = await createStoreOrder(db, input);
  return (await markStoreOrderPaid(db, order.id, { paymentIntentId: `pi_${order.id}` }, { source: "stripe" }))!.order;
}
const eventTypes = async (orderId: string) => (await listStoreOrderEvents(db, orderId)).map((event) => event.type);
const label = { shipmentId: "shp_1", labelUrl: "https://etiquetas.test/1.pdf", carrier: "Estafeta", trackingNumber: "GUIA123" };

describe("lista de pedidos", () => {
  it("filtra por estado, cuenta cada pestaña y pone primero lo que espera acción", async () => {
    const product = await seedProduct(db, { stock: 20 });
    const toShipOld = await paid(shippingOrder([{ productId: product.id, quantity: 2 }]));
    const toShipNew = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));
    const toPickup = await paid(pickupOrder([{ productId: product.id, quantity: 1 }]));
    const unpaid = (await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]))).order;
    const delivered = await paid(pickupOrder([{ productId: product.id, quantity: 1 }]));
    await markStoreReadyForPickup(db, delivered.id, panel);
    await markStoreDelivered(db, delivered.id, panel);

    const all = await searchStoreOrders(db, { filter: "all" });
    expect(all.counts).toEqual({ all: 5, to_ship: 2, to_pickup: 1, in_transit: 0, delivered: 1, exception: 0, unpaid: 1 });
    expect(all.rows.slice(0, 3).map((row) => row.id)).toEqual([toShipOld.id, toShipNew.id, toPickup.id]);
    expect(all.rows.slice(0, 3).every((row) => row.waiting)).toBe(true);
    expect(all.rows.find((row) => row.id === unpaid.id)?.waiting).toBe(false);
    expect(all.rows.find((row) => row.id === toShipOld.id)?.units).toBe(2);

    const toShip = await searchStoreOrders(db, { filter: "to_ship" });
    expect(toShip.rows.map((row) => row.id)).toEqual([toShipOld.id, toShipNew.id]);
    expect(toShip.total).toBe(2);
  });

  it("busca por folio, nombre, correo o guía, sin comodines", async () => {
    const product = await seedProduct(db, { stock: 20 });
    const order = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));
    await markStoreLabelGenerated(db, order.id, label, panel);
    for (const term of [order.orderNumber.toLowerCase(), "ana pé", "ANA@EJEMPLO", "guia12"]) {
      expect((await searchStoreOrders(db, { filter: "all", search: term })).rows.map((row) => row.id)).toEqual([order.id]);
    }
    expect((await searchStoreOrders(db, { filter: "all", search: "%" })).total).toBe(0);
  });
});

describe("entrega", () => {
  it("envío: guía → paquetería → tránsito → entregado, sin saltos ni repeticiones", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));

    expect(await markStoreHandedToCarrier(db, order.id, null, panel)).toBeNull(); // sin guía no sale
    expect(await markStoreDelivered(db, order.id, panel)).toBeNull();
    expect((await markStoreLabelGenerated(db, order.id, label, panel))?.fulfillmentStatus).toBe("label_generated");
    expect(await markStoreLabelGenerated(db, order.id, label, panel)).toBeNull();
    const handed = await markStoreHandedToCarrier(db, order.id, null, panel);
    expect(handed).toMatchObject({ fulfillmentStatus: "handed_to_carrier", trackingNumber: "GUIA123" });
    expect(handed?.fulfilledAt).toBeInstanceOf(Date);
    expect(await markStoreHandedToCarrier(db, order.id, null, panel)).toBeNull();
    expect((await markStoreInTransit(db, order.id, "out_for_delivery", panel))?.fulfillmentStatus).toBe("out_for_delivery");
    expect(await markStoreInTransit(db, order.id, "in_transit", panel)).toBeNull(); // nunca regresa
    expect((await markStoreDelivered(db, order.id, panel))?.deliveredAt).toBeInstanceOf(Date);
    expect((await eventTypes(order.id)).slice(-4)).toEqual(["LABEL_GENERATED", "HANDED_TO_CARRIER", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  it("una guía hecha por fuera se registra al marcar enviado", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));
    const handed = await markStoreHandedToCarrier(db, order.id, { carrier: "DHL", trackingNumber: "MANUAL1", trackingUrl: null }, panel);
    expect(handed).toMatchObject({ fulfillmentStatus: "handed_to_carrier", carrier: "DHL", trackingNumber: "MANUAL1" });
  });

  it("recolección: listo → entregado; un pedido sin pagar no avanza", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const unpaid = (await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]))).order;
    expect(await markStoreReadyForPickup(db, unpaid.id, panel)).toBeNull();
    const order = await paid(pickupOrder([{ productId: product.id, quantity: 1 }]));
    expect(await markStoreDelivered(db, order.id, panel)).toBeNull();
    expect((await markStoreReadyForPickup(db, order.id, panel))?.fulfillmentStatus).toBe("ready_for_pickup");
    expect((await markStoreDelivered(db, order.id, panel))?.fulfillmentStatus).toBe("delivered");
  });

  it("una incidencia reportada pausa el pedido y al resolverla vuelve a donde estaba", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));
    await markStoreLabelGenerated(db, order.id, label, panel);
    expect((await reportStoreException(db, order.id, "Dirección incorrecta", panel))?.fulfillmentStatus).toBe("exception");
    expect(await reportStoreException(db, order.id, "otra", panel)).toBeNull();
    expect(await markStoreHandedToCarrier(db, order.id, null, panel)).toBeNull();
    expect((await resolveStoreException(db, order.id, "Ya corrigió", panel))?.fulfillmentStatus).toBe("label_generated");
    expect(await resolveStoreException(db, order.id, null, panel)).toBeNull();
  });
});

describe("cancelación", () => {
  it("sin pagar: queda cancelado y libera lo apartado, una sola vez", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 2 }]));
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 2 });
    const result = await cancelStoreOrder(db, order.id, { ...panel, note: "Se arrepintió" });
    expect(result).toMatchObject({ changed: true, restocked: false, order: { paymentStatus: "cancelled", inventoryReserved: false } });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await cancelStoreOrder(db, order.id, panel)).toMatchObject({ changed: false });
    await expectLedgerMatches(db, product.id);
  });

  it("con pago vigente exige el reembolso primero; reembolsado devuelve las piezas una sola vez", async () => {
    const base = await seedProduct(db, { stock: 10 });
    const duo = await seedProduct(db, { stock: 0, stockProductId: base.id, stockUnits: 2, price: 90_000 });
    const order = await paid(pickupOrder([{ productId: duo.id, quantity: 2 }]));
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 6, reserved: 0 });
    expect(await cancelStoreOrder(db, order.id, panel)).toEqual({ error: "paid" });

    await applyStoreRefund(db, order.id, order.totalAmount, { source: "panel" });
    expect(await cancelStoreOrder(db, order.id, panel)).toMatchObject({ changed: true, restocked: true });
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 10, reserved: 0 });
    expect((await listStockMovements(db, base.id))[0]).toMatchObject({ reason: "return", deltaOnHand: 4, orderNumber: order.orderNumber, actor: panel.actor });
    expect(await cancelStoreOrder(db, order.id, panel)).toMatchObject({ changed: false, restocked: false });
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 10 });
    await expectLedgerMatches(db, base.id);
  });

  it("un pedido que ya salió no se cancela ni regresa piezas", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await paid(shippingOrder([{ productId: product.id, quantity: 1 }]));
    await markStoreHandedToCarrier(db, order.id, { carrier: "DHL", trackingNumber: "X1", trackingUrl: null }, panel);
    await applyStoreRefund(db, order.id, order.totalAmount, { source: "stripe" });
    expect(await cancelStoreOrder(db, order.id, panel)).toEqual({ error: "shipped" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 4 });
  });

  it("un pago sin existencias (nunca descontó) se cancela sin sumar piezas", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const first = (await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]))).order;
    await cancelStoreOrder(db, first.id, panel);
    const taker = await paid(pickupOrder([{ productId: product.id, quantity: 1 }]));
    const late = (await markStoreOrderPaid(db, first.id, { paymentIntentId: "pi_late" }, { source: "stripe" }))!;
    expect(late.outcome).toBe("paid_oversold");
    expect(taker.paymentStatus).toBe("paid");
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 0, reserved: 0 });
  });
});

describe("productos y resumen", () => {
  it("el precio nuevo es el que se cobra; al alcanzar el precio normal deja de haber tachado", async () => {
    const product = await seedProduct(db, { price: 47_214, compareAtPrice: 54_900, saleEndsAt: new Date(Date.now() + 86_400_000) });
    const lower = await updateStoreProductSettings(db, product.id, { price: 45_000, maxQuantityPerOrder: 4, lowStockThreshold: 3, published: false });
    expect(lower?.after).toMatchObject({ price: 45_000, compareAtPrice: 54_900, maxQuantityPerOrder: 4, lowStockThreshold: 3, published: false });
    expect(lower?.after.saleEndsAt).toBeInstanceOf(Date);
    const full = await updateStoreProductSettings(db, product.id, { price: 54_900 });
    expect(full?.after).toMatchObject({ price: 54_900, compareAtPrice: null, saleEndsAt: null });
  });

  it("con el descuento vencido, editar el precio reemplaza el precio normal", async () => {
    const product = await seedProduct(db, { price: 47_214, compareAtPrice: 54_900, saleEndsAt: new Date(Date.now() - 1000) });
    const same = await updateStoreProductSettings(db, product.id, { price: 54_900 });
    expect(same?.after).toMatchObject({ price: 47_214, compareAtPrice: 54_900 }); // ya se cobra 549: sin cambio
    const changed = await updateStoreProductSettings(db, product.id, { price: 60_000 });
    expect(changed?.after).toMatchObject({ price: 60_000, compareAtPrice: null, saleEndsAt: null });
  });

  it("resumen: ventas sin lo reembolsado, por atender, poco inventario y más vendidos", async () => {
    const product = await seedProduct(db, { stock: 6, lowStockThreshold: 5, name: "UNO+UNO" });
    const a = await paid(shippingOrder([{ productId: product.id, quantity: 2 }]));
    await paid(pickupOrder([{ productId: product.id, quantity: 1 }]));
    await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    await applyStoreRefund(db, a.id, 10_000, { source: "stripe" });

    const all = await getStoreDashboard(db, null);
    expect(all).toMatchObject({ orders: 2, sales: 118_000 + 50_000 - 10_000, toShip: 1, toPickup: 1, exceptions: 0, lowStock: 1, topProducts: [{ name: "UNO+UNO", units: 3 }] });
    expect(await getStoreDashboard(db, new Date(Date.now() + 60_000))).toMatchObject({ orders: 0, sales: 0, toShip: 1, topProducts: [] });
    expect((await findStoreOrderById(db, a.id))?.paymentStatus).toBe("partially_refunded");
  });
});
