import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderById,
  listStockMovements,
  listStoreOrderEvents,
  markStoreCheckoutCreateFailed,
  markStoreOrderPaid,
  markStoreOrderPaymentFailed,
  releaseExpiredStoreOrders,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

// Base nueva por prueba: `releaseExpiredStoreOrders` es global y no debe ver pedidos de otras pruebas.
beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const stripe = { source: "stripe" as const };

async function place(productId: string, quantity: number, now?: Date) {
  return (await createStoreOrder(db, pickupOrder([{ productId, quantity }]), now)).order;
}

async function placeWithSession(productId: string, quantity: number) {
  const order = await place(productId, quantity);
  await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutes(30) });
  return order;
}

const eventTypes = async (orderId: string) => (await listStoreOrderEvents(db, orderId)).map((e) => e.type);

describe("pago confirmado", () => {
  it("descuenta las existencias, libera el apartado y deja el historial", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);

    const result = await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_test_1" }, { source: "stripe", externalRef: "evt_1" });
    expect(result?.outcome).toBe("paid");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", inventoryReserved: false, stripePaymentIntentId: "pi_test_1", fulfillmentStatus: "confirmed" });
    expect(result?.order.paidAt).toBeInstanceOf(Date);

    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    const sale = (await listStockMovements(db, product.id)).find((m) => m.reason === "sale");
    expect(sale).toMatchObject({ deltaOnHand: -2, deltaReserved: -2, orderNumber: order.orderNumber });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["PAYMENT_APPROVED", "INVENTORY_COMMITTED"]));
    await expectLedgerMatches(db, product.id);
  });

  it("un webhook repetido no cambia nada", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);
    await markStoreOrderPaid(db, order.id, {}, stripe);
    const again = await markStoreOrderPaid(db, order.id, {}, stripe);

    expect(again?.outcome).toBe("already_paid");
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    expect((await eventTypes(order.id)).filter((type) => type === "PAYMENT_APPROVED")).toHaveLength(1);
    await expectLedgerMatches(db, product.id);
  });

  it("devuelve null si el pedido no existe", async () => {
    expect(await markStoreOrderPaid(db, "00000000-0000-4000-8000-000000000000", {}, stripe)).toBeNull();
  });
});

describe("pago fallido y error al crear el pago", () => {
  it("libera lo apartado una sola vez", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);

    const first = await markStoreOrderPaymentFailed(db, order.id, stripe);
    expect(first?.changed).toBe(true);
    expect(first?.order).toMatchObject({ paymentStatus: "failed", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["PAYMENT_FAILED", "INVENTORY_RELEASED"]));

    expect((await markStoreOrderPaymentFailed(db, order.id, stripe))?.changed).toBe(false);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("si Stripe no crea la sesión, libera y registra el motivo", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 1);
    const result = await markStoreCheckoutCreateFailed(db, order.id, "stripe caído");
    expect(result?.changed).toBe(true);
    expect(result?.order.paymentStatus).toBe("failed");
    const failed = (await listStoreOrderEvents(db, order.id)).find((e) => e.type === "CHECKOUT_CREATE_FAILED");
    expect(failed?.metadata).toMatchObject({ reason: "stripe caído" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });
});

describe("vencimiento", () => {
  it("libera el pedido cuando vence la sesión más los 5 minutos de gracia", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 2);

    expect(await releaseExpiredStoreOrders(db, minutes(34))).toBe(0);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 2 });

    expect(await releaseExpiredStoreOrders(db, minutes(36))).toBe(1);
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ paymentStatus: "cancelled", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["CHECKOUT_EXPIRED", "INVENTORY_RELEASED"]));
    expect(await releaseExpiredStoreOrders(db, minutes(60))).toBe(0);
    await expectLedgerMatches(db, product.id);
  });

  it("un pedido sin sesión se libera a los 5 minutos", async () => {
    const product = await seedProduct(db, { stock: 5 });
    await place(product.id, 1);
    expect(await releaseExpiredStoreOrders(db, new Date(Date.now() + 2 * 60_000))).toBe(0);
    expect(await releaseExpiredStoreOrders(db, new Date(Date.now() + 6 * 60_000))).toBe(1);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
  });

  it("nunca libera un pedido pagado", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 1);
    await markStoreOrderPaid(db, order.id, {}, stripe);
    expect(await releaseExpiredStoreOrders(db, minutes(600))).toBe(0);
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ paymentStatus: "paid" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 4, reserved: 0 });
  });

  it("crear un pedido libera antes lo vencido, así la última pieza vuelve a estar disponible", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const stale = await place(product.id, 1);
    const later = new Date(Date.now() + 10 * 60_000);

    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]), later);
    expect(order.inventoryReserved).toBe(true);
    expect(await findStoreOrderById(db, stale.id)).toMatchObject({ paymentStatus: "cancelled", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 1, reserved: 1 });
    await expectLedgerMatches(db, product.id);
  });
});

describe("pago que llega tarde", () => {
  it("con stock disponible vuelve a descontar y el pedido queda pagado", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 2);
    await releaseExpiredStoreOrders(db, minutes(40));
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });

    const result = await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_late" }, stripe);
    expect(result?.outcome).toBe("paid");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "confirmed" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    const sale = (await listStockMovements(db, product.id)).find((m) => m.reason === "sale");
    expect(sale).toMatchObject({ deltaOnHand: -2, deltaReserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("sin stock queda pagado y marcado como excepción, sin vender lo que no existe", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const late = await placeWithSession(product.id, 1);
    await releaseExpiredStoreOrders(db, minutes(40));

    const other = await place(product.id, 1, minutes(40));
    await markStoreOrderPaid(db, other.id, {}, stripe);
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 0, reserved: 0 });

    const result = await markStoreOrderPaid(db, late.id, {}, stripe);
    expect(result?.outcome).toBe("paid_oversold");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "exception" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 0, reserved: 0 });
    const exception = (await listStoreOrderEvents(db, late.id)).find((e) => e.type === "EXCEPTION");
    expect(exception?.metadata).toMatchObject({ reason: "oversold_after_release" });
    expect(await eventTypes(late.id)).toContain("PAYMENT_APPROVED");
    expect(await eventTypes(late.id)).not.toContain("INVENTORY_COMMITTED");
    await expectLedgerMatches(db, product.id);
  });
});
