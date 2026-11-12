import { findStoreOrderBySessionId, upsertStoreProduct, type Database, type StoreProduct } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCatalog, quoteCart } from "../src/server/store/catalog.ts";
import { catalogConfigSchema, upsertOrder } from "../src/server/store/catalog-config.ts";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping } from "./helpers.ts";
import { AREA, inventoryOf, minutesAfter, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let uno: StoreProduct;

const pack = (slug: string, units: number, overrides: Partial<Parameters<typeof upsertStoreProduct>[1]> = {}) =>
  upsertStoreProduct(db, { slug, name: `Paquete de ${units}`, published: true, saleStatus: "on_sale", price: 261_000, stockProductId: uno.id, stockUnits: units, ...overrides });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  uno = await seedStoreProduct(db, { stock: 13 });
  await seedStoreSettings(db);
});

afterEach(() => close());

async function shipCheckout(productId: string, quantity = 1) {
  const quote = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity }], ...AREA }, clientIp: null });
  if (!quote.ok) throw new Error(JSON.stringify(quote.body));
  const result = await createStoreCheckout(
    { db, gateway, shipping, siteUrl: "https://inttimo.test", now: () => T0 },
    {
      body: {
        contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" },
        lines: [{ productId, quantity }],
        delivery: { method: "shipping", quoteId: quote.data.quoteId, rateId: "express", address: SHIP_ADDRESS },
        acceptTerms: true,
        termsVersion: STORE_TERMS_VERSION,
      },
      idempotencyKey: null,
      clientIp: null,
    },
  );
  return { quote: quote.data, result };
}

describe("paquetes en la tienda", () => {
  it("el catálogo cuenta paquetes completos y marca el envío gratis vigente", async () => {
    await pack("uno-mas-uno-paquete-6", 6, { freeShippingUntil: minutesAfter(60) });
    await pack("uno-mas-uno-duo", 2, { price: 90_000 });
    const result = await getCatalog({ db, now: () => T0 });
    if (!result.ok) throw new Error("catálogo");
    const bySlug = Object.fromEntries(result.data.products.map((product) => [product.slug, product]));
    expect(bySlug["uno-mas-uno-paquete-6"]).toMatchObject({ status: "low_stock", availableUnits: 2, freeShipping: true });
    expect(bySlug["uno-mas-uno-duo"]).toMatchObject({ freeShipping: false, price: { amount: 90_000 } });
    expect(bySlug["uno-mas-uno"]).toMatchObject({ freeShipping: false });
  });

  it("el carrito ajusta la cantidad a los paquetes completos disponibles", async () => {
    const six = await pack("uno-mas-uno-paquete-6", 6);
    const result = await quoteCart({ db, now: () => T0 }, { lines: [{ productId: six.id, quantity: 5 }] });
    if (!result.ok) throw new Error("carrito");
    expect(result.data.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2, subtotal: { amount: 522_000 } });
  });

  it("envío gratis: cotiza la caja con las piezas del paquete, muestra $0 y cobra $0 guardando la paquetería", async () => {
    const six = await pack("uno-mas-uno-paquete-6", 6, { freeShippingUntil: minutesAfter(60) });
    const { quote, result } = await shipCheckout(six.id);
    // Sin medidas propias, el paquete se cotiza como 6 cajas de UNO+UNO apiladas.
    expect(shipping.quotes[0]!.parcel).toEqual({ weightKg: 6, lengthCm: 16, widthCm: 11, heightCm: 66 });
    expect(quote.rates.map((rate) => [rate.label, rate.price.amount])).toEqual([["Envío gratis", 0], ["Envío gratis", 0]]);
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ deliveryMethod: "shipping", shippingAmount: 0, shippingLabel: "Envío gratis · DHL Express", lines: [{ unitAmount: 261_000, quantity: 1 }] });
    const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
    expect(order).toMatchObject({ shippingAmount: 0, totalAmount: 261_000, shippingSelection: { carrier: "DHL", rateId: "rate_exp" } });
    expect(await inventoryOf(db, uno.id)).toEqual({ onHand: 13, reserved: 6 });
  });

  it("con la promoción vencida se cobra el envío normal", async () => {
    const six = await pack("uno-mas-uno-paquete-6", 6, { freeShippingUntil: minutesAfter(-1) });
    const { quote, result } = await shipCheckout(six.id);
    expect(quote.rates[1]).toMatchObject({ label: "Envío express", price: { amount: 32_050 } });
    expect(gateway.storeCreated[0]).toMatchObject({ shippingAmount: 32_050, shippingLabel: "Envío · DHL Express" });
    expect(result.status).toBe(201);
  });

  it("un paquete con medidas propias se cotiza con esas medidas", async () => {
    const six = await pack("uno-mas-uno-paquete-6", 6, { weightGrams: 5500, lengthCm: 34, widthCm: 24, heightCm: 22 });
    await shipCheckout(six.id);
    expect(shipping.quotes[0]!.parcel).toEqual({ weightKg: 5.5, lengthCm: 34, widthCm: 24, heightCm: 22 });
  });
});

describe("fin del descuento de temporada (saleEndsAt)", () => {
  const onSale = (saleEndsAt: Date) => upsertStoreProduct(db, { slug: uno.slug, name: uno.name, price: 47_214, compareAtPrice: 54_900, saleEndsAt });

  it("antes del fin: cobra el precio con descuento y muestra el tachado", async () => {
    await onSale(minutesAfter(60));
    const result = await getCatalog({ db, now: () => T0 });
    if (!result.ok) throw new Error("catálogo");
    expect(result.data.products[0]).toMatchObject({ price: { amount: 47_214 }, compareAtPrice: { amount: 54_900 } });
    const { result: checkout } = await shipCheckout(uno.id, 2);
    expect(checkout.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ lines: [{ unitAmount: 47_214, quantity: 2 }] });
  });

  it("vencido: catálogo, carrito y pedido cobran el precio normal, sin tachado", async () => {
    await onSale(minutesAfter(-1));
    const catalog = await getCatalog({ db, now: () => T0 });
    if (!catalog.ok) throw new Error("catálogo");
    expect(catalog.data.products[0]).toMatchObject({ price: { amount: 54_900 }, compareAtPrice: null });
    const cart = await quoteCart({ db, now: () => T0 }, { lines: [{ productId: uno.id, quantity: 2 }] });
    if (!cart.ok) throw new Error("carrito");
    expect(cart.data.lines[0]).toMatchObject({ unitPrice: { amount: 54_900 }, subtotal: { amount: 109_800 } });
    const { result } = await shipCheckout(uno.id, 2);
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ lines: [{ unitAmount: 54_900, quantity: 2 }] });
    expect(await findStoreOrderBySessionId(db, "cs_test_store_000000000001")).toMatchObject({ subtotalAmount: 109_800 });
  });

  it("la base no acepta fin de descuento sin precio normal", async () => {
    await expect(upsertStoreProduct(db, { slug: uno.slug, name: uno.name, price: 47_214, compareAtPrice: null, saleEndsAt: minutesAfter(60) })).rejects.toThrow();
  });
});

describe("archivo de catálogo (pnpm store:catalog)", () => {
  const product = { slug: "uno-mas-uno", name: "UNO+UNO", price: 472.14, compareAtPrice: 549, saleStatus: "on_sale", published: true };

  it("convierte pesos a centavos y ordena los productos base antes que los paquetes", () => {
    const parsed = catalogConfigSchema.parse({ products: [{ ...product, slug: "duo", price: 900, compareAtPrice: 1098, bundleOf: { slug: "uno-mas-uno", units: 2 } }, product] });
    expect(upsertOrder(parsed.products).map((p) => [p.slug, p.price, p.compareAtPrice])).toEqual([["uno-mas-uno", 47_214, 54_900], ["duo", 90_000, 109_800]]);
  });

  it("rechaza precios con más de 2 decimales, tachado menor al precio, slugs repetidos y fechas sin zona", () => {
    expect(catalogConfigSchema.safeParse({ products: [{ ...product, price: 472.145 }] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [{ ...product, compareAtPrice: 400 }] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [product, product] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [{ ...product, freeShippingUntil: "2026-12-31T23:59:59" }] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [{ ...product, freeShippingUntil: "2026-12-31T23:59:59-06:00" }] }).success).toBe(true);
    expect(catalogConfigSchema.safeParse({ products: [{ ...product, compareAtPrice: null, saleEndsAt: "2026-12-26T00:00:00-06:00" }] }).success).toBe(false);
  });

  it("el catálogo aprobado del repositorio es válido", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(new URL("../../../docs/store/catalogo.json", import.meta.url), "utf8"));
    const parsed = catalogConfigSchema.parse(raw);
    expect(parsed.products.map((p) => [p.slug, p.price, p.saleEndsAt ?? null])).toEqual([
      ["uno-mas-uno", 47_214, "2026-12-26T00:00:00-06:00"],
      ["uno-mas-uno-duo", 90_000, "2026-12-26T00:00:00-06:00"],
      ["uno-mas-uno-paquete-6", 261_000, null],
      ["uno-mas-uno-paquete-10", 419_900, null],
    ]);
  });
});
