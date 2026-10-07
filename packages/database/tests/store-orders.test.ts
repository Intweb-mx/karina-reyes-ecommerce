import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  addStoreOrderNote,
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderById,
  findStoreOrderByNumber,
  findStoreOrderBySessionId,
  InsufficientStoreStockError,
  InvalidStoreOrderError,
  listStockMovements,
  listStoreOrderEvents,
  listStoreOrderItems,
  listStoreOrderNotes,
  StoreProductUnavailableError,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const ADDRESS = { name: "Ana Pérez", phone: "6141234567", street: "Calle 1 #100", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", reference: null };
const SELECTION = { provider: "skydropx" as const, quotationId: "quo_1", rateId: "rate_1", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: "2026-10-07T12:00:00.000Z" };

describe("crear pedido", () => {
  it("aparta el stock, toma el precio de la base y copia las líneas", async () => {
    const product = await seedProduct(db, { stock: 5, price: 50_000, sku: `SKU-${randomUUID().slice(0, 6)}` });
    const { order, items, reused } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 2 }]));

    expect(reused).toBe(false);
    expect(order.orderNumber).toMatch(/^INT-[2-9A-HJ-NP-Z]{10}$/);
    expect(order).toMatchObject({
      paymentStatus: "pending",
      fulfillmentStatus: "confirmed",
      email: "ana@ejemplo.com",
      subtotalAmount: 100_000,
      shippingAmount: 0,
      totalAmount: 100_000,
      currency: "mxn",
      inventoryReserved: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: product.id, productSlug: product.slug, name: "Producto de prueba", sku: product.sku, quantity: 2, unitAmount: 50_000 });

    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 2 });
    const reservation = (await listStockMovements(db, product.id)).find((m) => m.reason === "reservation");
    expect(reservation).toMatchObject({ deltaOnHand: 0, deltaReserved: 2, orderNumber: order.orderNumber, actor: "system" });
    expect((await listStoreOrderEvents(db, order.id)).map((e) => e.type)).toEqual(expect.arrayContaining(["ORDER_CREATED", "INVENTORY_RESERVED"]));
    await expectLedgerMatches(db, product.id);
  });

  it("junta las líneas repetidas de un mismo producto", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { items, order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }]));
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(3);
    expect(order.subtotalAmount).toBe(150_000);
  });

  it("con envío suma el costo al total; en recolección no se puede cobrar envío", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const shipping = await createStoreOrder(
      db,
      pickupOrder([{ productId: product.id, quantity: 1 }], { delivery: { method: "shipping", address: ADDRESS, selection: SELECTION }, shippingAmount: 18_000 }),
    );
    expect(shipping.order).toMatchObject({ deliveryMethod: "shipping", subtotalAmount: 50_000, shippingAmount: 18_000, totalAmount: 68_000, pickupPointId: null });
    expect(shipping.order.deliveryAddress).toMatchObject({ street: "Calle 1 #100" });

    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }], { shippingAmount: 100 }))).rejects.toBeInstanceOf(InvalidStoreOrderError);
  });

  it("rechaza pedidos vacíos y cantidades inválidas", async () => {
    const product = await seedProduct(db, { stock: 5 });
    await expect(createStoreOrder(db, pickupOrder([]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 0 }]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1.5 }]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
  });
});

describe("sin sobreventa", () => {
  it("rechaza lo que supera lo disponible y no cambia nada", async () => {
    const product = await seedProduct(db, { stock: 2 });
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 3 }]))).rejects.toMatchObject({ name: "InsufficientStoreStockError", available: 2, productId: product.id });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 2, reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("con varios productos es todo o nada", async () => {
    const plenty = await seedProduct(db, { stock: 5 });
    const scarce = await seedProduct(db, { stock: 1 });
    await expect(
      createStoreOrder(db, pickupOrder([{ productId: plenty.id, quantity: 2 }, { productId: scarce.id, quantity: 2 }])),
    ).rejects.toBeInstanceOf(InsufficientStoreStockError);
    expect(await inventoryOf(db, plenty.id)).toMatchObject({ reserved: 0 });
    expect(await inventoryOf(db, scarce.id)).toMatchObject({ reserved: 0 });
  });

  it("dos compras a la vez por la última pieza: solo una gana", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const results = await Promise.allSettled([
      createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }])),
      createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }])),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(InsufficientStoreStockError);
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 1, reserved: 1 });
    await expectLedgerMatches(db, product.id);
  });

  it("no vende productos ocultos, sin precio, próximamente o inexistentes", async () => {
    const hidden = await seedProduct(db, { published: false });
    const noPrice = await seedProduct(db, { price: null });
    const soon = await seedProduct(db, { saleStatus: "coming_soon" });
    for (const productId of [hidden.id, noPrice.id, soon.id, randomUUID()]) {
      await expect(createStoreOrder(db, pickupOrder([{ productId, quantity: 1 }]))).rejects.toBeInstanceOf(StoreProductUnavailableError);
    }
    expect(await inventoryOf(db, hidden.id)).toMatchObject({ reserved: 0 });
  });
});

describe("idempotencia", () => {
  it("la misma clave devuelve el mismo pedido y aparta una sola vez", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const input = pickupOrder([{ productId: product.id, quantity: 2 }], { idempotencyKey: `clave-${randomUUID()}` });
    const first = await createStoreOrder(db, input);
    const second = await createStoreOrder(db, input);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.items).toHaveLength(1);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 2 });
  });
});

describe("consultas, sesión de pago y notas", () => {
  it("liga la sesión de Stripe una sola vez y permite buscar por folio, id y sesión", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    const sessionId = `cs_test_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 60_000);

    const attached = await attachStoreCheckoutSession(db, order.id, { id: sessionId, url: "https://checkout.stripe.test/x", expiresAt });
    expect(attached).toMatchObject({ stripeCheckoutSessionId: sessionId, stripeCheckoutUrl: "https://checkout.stripe.test/x" });
    expect(await attachStoreCheckoutSession(db, order.id, { id: "otra", url: "https://x.test", expiresAt })).toBeNull();

    expect((await findStoreOrderById(db, order.id))?.id).toBe(order.id);
    expect((await findStoreOrderByNumber(db, order.orderNumber))?.id).toBe(order.id);
    expect((await findStoreOrderBySessionId(db, sessionId))?.id).toBe(order.id);
    expect(await findStoreOrderByNumber(db, "INT-NOEXISTE")).toBeNull();
    expect((await listStoreOrderItems(db, order.id))[0]).toMatchObject({ quantity: 1 });
    expect((await listStoreOrderEvents(db, order.id)).map((e) => e.type)).toContain("CHECKOUT_CREATED");
  });

  it("las notas internas se agregan con autor y se listan en orden", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    await addStoreOrderNote(db, { orderId: order.id, body: "Primera", authorEmail: "karina@ejemplo.com" });
    await addStoreOrderNote(db, { orderId: order.id, body: "Segunda", authorEmail: "leo@ejemplo.com" });
    expect((await listStoreOrderNotes(db, order.id)).map((n) => [n.body, n.authorEmail])).toEqual([
      ["Primera", "karina@ejemplo.com"],
      ["Segunda", "leo@ejemplo.com"],
    ]);
  });
});
