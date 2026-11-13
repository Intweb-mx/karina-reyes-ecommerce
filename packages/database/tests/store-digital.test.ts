import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  applyStoreRefund,
  consumeStoreDownloadLink,
  createStoreOrder,
  findStoreOrderById,
  getStoreDownloadLink,
  InvalidStoreOrderError,
  issueStoreDownloadLinks,
  markStoreDigitalOrderDelivered,
  markStoreOrderPaid,
  upsertStoreProduct,
  type StoreProduct,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let game: StoreProduct;
let pdf: StoreProduct;

const digitalOrder = (lines: { productId: string; quantity: number }[]) => pickupOrder(lines, { delivery: { method: "digital" } });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  game = await seedProduct(db, { slug: "uno-mas-uno", stock: 3 });
  pdf = await upsertStoreProduct(db, { slug: "despues-de-la-pregunta", name: "Después de la pregunta", type: "digital", digitalFileKey: "bonus/guia.pdf", published: true, saleStatus: "on_sale", price: 3_000, maxQuantityPerOrder: 1 });
});

afterEach(() => close());

describe("pedidos con productos digitales", () => {
  it("solo digital: entrega 'digital', no aparta inventario y al pagar no mueve existencias", async () => {
    const { order, items } = await createStoreOrder(db, digitalOrder([{ productId: pdf.id, quantity: 1 }]));
    expect(order).toMatchObject({ deliveryMethod: "digital", shippingAmount: 0, totalAmount: 3_000, deliveryAddress: null, pickupPointId: null });
    expect(items).toMatchObject([{ productId: pdf.id, digital: true }]);
    expect(await inventoryOf(db, pdf.id)).toMatchObject({ onHand: 0, reserved: 0 });

    const paid = await markStoreOrderPaid(db, order.id, {}, { source: "stripe" });
    expect(paid?.outcome).toBe("paid");
    expect(await inventoryOf(db, pdf.id)).toMatchObject({ onHand: 0, reserved: 0 });
    await expectLedgerMatches(db, pdf.id);
  });

  it("mixto: aparta y descuenta solo el juego; el PDF viaja con la entrega física", async () => {
    const { order, items } = await createStoreOrder(db, pickupOrder([{ productId: game.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }]));
    expect(items.find((item) => item.productId === pdf.id)?.digital).toBe(true);
    expect(await inventoryOf(db, game.id)).toMatchObject({ onHand: 3, reserved: 1 });
    await markStoreOrderPaid(db, order.id, {}, { source: "stripe" });
    expect(await inventoryOf(db, game.id)).toMatchObject({ onHand: 2, reserved: 0 });
    await expectLedgerMatches(db, game.id);
  });

  it("la entrega debe corresponder al carrito", async () => {
    await expect(createStoreOrder(db, pickupOrder([{ productId: pdf.id, quantity: 1 }]))).rejects.toThrow(InvalidStoreOrderError);
    await expect(createStoreOrder(db, digitalOrder([{ productId: game.id, quantity: 1 }]))).rejects.toThrow(InvalidStoreOrderError);
    await expect(createStoreOrder(db, digitalOrder([{ productId: game.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }]))).rejects.toThrow(InvalidStoreOrderError);
    await expect(createStoreOrder(db, { ...digitalOrder([{ productId: pdf.id, quantity: 1 }]), shippingAmount: 100 })).rejects.toThrow(InvalidStoreOrderError);
  });

  it("un producto digital sin archivo no se puede comprar, y la base no acepta un paquete digital", async () => {
    await upsertStoreProduct(db, { slug: pdf.slug, name: pdf.name, type: "digital", digitalFileKey: null, published: true, saleStatus: "on_sale", price: 3_000 });
    await expect(createStoreOrder(db, digitalOrder([{ productId: pdf.id, quantity: 1 }]))).rejects.toThrow("no está disponible");
    await expect(upsertStoreProduct(db, { slug: "pdf-paquete", name: "x", type: "digital", digitalFileKey: "a.pdf", stockProductId: game.id, stockUnits: 2 })).rejects.toThrow();
    await expect(upsertStoreProduct(db, { slug: "juego-con-archivo", name: "x", type: "physical", digitalFileKey: "a.pdf" })).rejects.toThrow();
  });
});

describe("enlaces de descarga (un solo uso)", () => {
  async function paidDigitalOrder() {
    const { order } = await createStoreOrder(db, digitalOrder([{ productId: pdf.id, quantity: 1 }]));
    await markStoreOrderPaid(db, order.id, {}, { source: "stripe" });
    return order;
  }

  it("se puede ver sin gastarlo; se gasta una sola vez", async () => {
    const order = await paidDigitalOrder();
    await issueStoreDownloadLinks(db, order.id, [{ productId: pdf.id, tokenHash: "h1" }], { source: "api" });
    expect(await getStoreDownloadLink(db, "h1")).toMatchObject({ status: "ready", productName: "Después de la pregunta", orderNumber: order.orderNumber });
    expect(await getStoreDownloadLink(db, "h1")).toMatchObject({ status: "ready" });

    expect(await consumeStoreDownloadLink(db, "h1")).toEqual({ status: "ok", fileKey: "bonus/guia.pdf", productSlug: "despues-de-la-pregunta", orderId: order.id });
    expect(await consumeStoreDownloadLink(db, "h1")).toEqual({ status: "used" });
    expect(await getStoreDownloadLink(db, "h1")).toMatchObject({ status: "used" });
    expect(await consumeStoreDownloadLink(db, "no-existe")).toEqual({ status: "invalid" });
  });

  it("dos clics simultáneos: solo uno obtiene el archivo", async () => {
    const order = await paidDigitalOrder();
    await issueStoreDownloadLinks(db, order.id, [{ productId: pdf.id, tokenHash: "h1" }], { source: "api" });
    const results = await Promise.all([consumeStoreDownloadLink(db, "h1"), consumeStoreDownloadLink(db, "h1")]);
    expect(results.map((r) => r.status).sort()).toEqual(["ok", "used"]);
  });

  it("reenviar revoca los anteriores sin usar; el nuevo funciona", async () => {
    const order = await paidDigitalOrder();
    await issueStoreDownloadLinks(db, order.id, [{ productId: pdf.id, tokenHash: "h1" }], { source: "api" });
    await issueStoreDownloadLinks(db, order.id, [{ productId: pdf.id, tokenHash: "h2" }], { source: "panel", actor: "karina@inttimo.test" });
    expect(await consumeStoreDownloadLink(db, "h1")).toEqual({ status: "revoked" });
    expect(await consumeStoreDownloadLink(db, "h2")).toMatchObject({ status: "ok" });
  });

  it("sin pago vigente no se emite ni se entrega; un reembolso total apaga el enlace", async () => {
    const { order: pending } = await createStoreOrder(db, digitalOrder([{ productId: pdf.id, quantity: 1 }]));
    await expect(issueStoreDownloadLinks(db, pending.id, [{ productId: pdf.id, tokenHash: "x" }], { source: "api" })).rejects.toThrow(InvalidStoreOrderError);

    const order = await paidDigitalOrder();
    await expect(issueStoreDownloadLinks(db, order.id, [{ productId: game.id, tokenHash: "y" }], { source: "api" })).rejects.toThrow(InvalidStoreOrderError);
    await issueStoreDownloadLinks(db, order.id, [{ productId: pdf.id, tokenHash: "h1" }], { source: "api" });
    await applyStoreRefund(db, order.id, order.totalAmount, { source: "stripe" });
    expect(await getStoreDownloadLink(db, "h1")).toEqual({ status: "unpaid" });
    expect(await consumeStoreDownloadLink(db, "h1")).toEqual({ status: "unpaid" });
  });

  it("un pedido solo digital queda entregado (una vez); uno con productos físicos no cambia", async () => {
    const order = await paidDigitalOrder();
    expect(await markStoreDigitalOrderDelivered(db, order.id, { source: "api" })).toBe(true);
    expect(await markStoreDigitalOrderDelivered(db, order.id, { source: "api" })).toBe(false);
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ fulfillmentStatus: "delivered" });

    const { order: mixed } = await createStoreOrder(db, pickupOrder([{ productId: game.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }]));
    await markStoreOrderPaid(db, mixed.id, {}, { source: "stripe" });
    expect(await markStoreDigitalOrderDelivered(db, mixed.id, { source: "api" })).toBe(false);
  });
});
