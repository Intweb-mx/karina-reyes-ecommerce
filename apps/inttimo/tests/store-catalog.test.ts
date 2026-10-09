import { attachStoreCheckoutSession, createStoreOrder, upsertStoreProduct, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog, getProduct, productStatus, quoteCart } from "../src/server/store/catalog.ts";
import { storeRoute } from "../src/server/store/http.ts";
import { inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, T0, UNO } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
const deps = () => ({ db, now: () => T0 });
const MXN = (amount: number) => ({ amount, currency: "mxn" });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

describe("estado comercial", () => {
  const base = { saleStatus: "on_sale" as const, lowStockThreshold: 5 };
  it.each([
    [{ ...base, saleStatus: "coming_soon" as const, effectiveAvailable: 50 }, "coming_soon"],
    [{ ...base, saleStatus: "presale" as const, effectiveAvailable: 0 }, "presale"],
    [{ ...base, effectiveAvailable: 0 }, "sold_out"],
    [{ ...base, effectiveAvailable: 5 }, "low_stock"],
    [{ ...base, effectiveAvailable: 6 }, "available"],
  ])("%o → %s", (product, expected) => {
    expect(productStatus(product)).toBe(expected);
  });
});

describe("catálogo", () => {
  it("muestra solo publicados con contenido, con precio de la base", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const product = await seedStoreProduct(db);
    await upsertStoreProduct(db, { slug: "sin-contenido", name: "Sin contenido", published: true, saleStatus: "on_sale", price: 10_000 });
    await upsertStoreProduct(db, { slug: "oculto", name: "Oculto", published: false });

    const result = await getCatalog(deps());
    expect(result.ok && result.data.products).toEqual([
      expect.objectContaining({
        id: product.id,
        slug: UNO,
        name: "UNO+UNO",
        type: "physical",
        status: "available",
        price: MXN(50_000),
        compareAtPrice: null,
        availableUnits: null,
        territories: ["conversacion", "conexion"],
        tagline: "Conversaciones que nos acercan.",
      }),
    ]);
  });

  it("con poco inventario dice cuántas quedan", async () => {
    await seedStoreProduct(db, { stock: 3 });
    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "low_stock", availableUnits: 3 });
  });

  it("sin precio aparece como próximamente y sin precio", async () => {
    await seedStoreProduct(db, { price: null, saleStatus: "coming_soon" });
    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "coming_soon", price: null });
  });

  it("cuenta como disponibles los apartados vencidos sin escribir en la base", async () => {
    const product = await seedStoreProduct(db, { stock: 6 });
    const { order } = await createStoreOrder(db, pickupOrderFor(product.id, 4), T0);
    await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutesAfter(-60) });

    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "available", availableUnits: null });
    expect(await inventoryOf(db, product.id)).toEqual({ onHand: 6, reserved: 4 });
  });
});

describe("detalle de producto", () => {
  it("404 si no existe, está oculto o el slug no es válido", async () => {
    await seedStoreProduct(db, { published: false });
    for (const slug of [UNO, "otro", "../x"]) {
      expect(await getProduct(deps(), slug)).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    }
  });

  it("combina lo comercial de la base con el contenido", async () => {
    await seedStoreProduct(db, { maxQuantityPerOrder: 4 });
    const result = await getProduct(deps(), UNO);
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    expect(result.data).toMatchObject({ slug: UNO, maxQuantityPerOrder: 4, related: [], seo: { title: "UNO+UNO · Conversaciones que nos acercan" } });
    expect(result.data.faqs.map((faq) => faq.id)).toEqual(["envios-mexico", "recoleccion", "devoluciones", "para-quien"]);
    expect(result.data.gallery).toHaveLength(3);
    expect(result.data.gallery.some((image) => image.src.includes("bonus"))).toBe(false);
    expect(result.data.howToPlay).toHaveLength(4);
    expect(result.data.includes.length).toBeGreaterThan(0);
  });
});

describe("cotizar carrito", () => {
  const quote = (body: unknown) => quoteCart(deps(), body);

  it("calcula precios y totales en el servidor y une líneas repetidas", async () => {
    const product = await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }, { productId: product.id.toUpperCase(), quantity: 1 }] });
    expect(result.ok && result.data).toEqual({
      lines: [
        expect.objectContaining({ productId: product.id, slug: UNO, name: "UNO+UNO", unitPrice: MXN(50_000), quantity: 2, subtotal: MXN(100_000), notice: null, available: true, maxQuantity: 10 }),
      ],
      subtotal: MXN(100_000),
      discount: null,
      coupon: null,
      couponError: null,
      total: MXN(100_000),
    });
  });

  it("ajusta al máximo por pedido y lo explica", async () => {
    const product = await seedStoreProduct(db, { maxQuantityPerOrder: 3 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 5 }] });
    expect(result.ok && result.data.lines[0]).toMatchObject({ quantity: 3, maxQuantity: 3, notice: "Máximo 3 por pedido.", subtotal: MXN(150_000) });
  });

  it("ajusta a lo disponible y lo explica", async () => {
    const product = await seedStoreProduct(db, { stock: 2 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 4 }] });
    expect(result.ok && result.data.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2, notice: "Solo quedan 2 unidades; ajustamos la cantidad." });
  });

  it("agotado: línea no disponible y fuera del total", async () => {
    const product = await seedStoreProduct(db, { stock: 0 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }] });
    expect(result.ok && result.data).toMatchObject({ lines: [{ available: false, notice: "Este producto se agotó.", subtotal: MXN(0) }], total: MXN(0) });
  });

  it("sin precio: línea no disponible", async () => {
    const product = await seedStoreProduct(db, { price: null });
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }] });
    expect(result.ok && result.data).toMatchObject({ lines: [{ available: false, notice: "Este producto todavía no está a la venta." }], total: MXN(0) });
  });

  it("omite ids desconocidos (p. ej. del simulador)", async () => {
    await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: "prod_uno_mas_uno", quantity: 1 }] });
    expect(result.ok && result.data.lines).toEqual([]);
  });

  it("no hay cupones: cualquier código es inválido y no descuenta", async () => {
    const product = await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }], couponCode: "VERANO" });
    expect(result.ok && result.data).toMatchObject({ couponError: "Este cupón no es válido.", coupon: null, discount: null, total: MXN(50_000) });
  });

  it("rechaza un cuerpo inválido", async () => {
    expect(await quote({ lines: [{ productId: "x", quantity: 0 }] })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(await quote(null)).toMatchObject({ status: 400 });
  });
});

describe("rutas de la tienda", () => {
  it("con la tienda oculta responden 404", async () => {
    const response = await storeRoute("prueba", async () => Response.json({ ok: true }), false);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("un error inesperado es 503 genérico y queda en el log", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await storeRoute("prueba", async () => {
      throw new Error("base caída");
    }, true);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "service_unavailable" } });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("prueba_failed"));
  });

  it("el log de un error inesperado nunca lleva los parámetros de la consulta ni correos", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    class FakeQueryError extends Error {
      override name = "DrizzleQueryError";
      constructor() {
        super('Failed query: insert into "store_orders" ("full_name", "email") values ($1, $2)\nparams: Ana, ana@x.com');
        this.cause = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
    }
    await storeRoute("prueba", async () => {
      throw new FakeQueryError();
    }, true);
    const logged = String(errors.mock.calls[0]![0]);
    expect(logged).not.toContain("Ana");
    expect(logged).not.toContain("ana@x.com");
    expect(logged).not.toContain("params");
    expect(JSON.parse(logged)).toMatchObject({ msg: "prueba_failed", error: expect.stringContaining("DrizzleQueryError") });
    expect(logged).toContain("23505");
    expect(logged).toContain("Failed query");

    errors.mockClear();
    await storeRoute("prueba", async () => {
      throw new Error("rechazado para ana@x.com");
    }, true);
    expect(String(errors.mock.calls[0]![0])).toContain("[correo]");
    expect(String(errors.mock.calls[0]![0])).not.toContain("ana@x.com");
  });

  it("con la tienda visible pasa la respuesta tal cual", async () => {
    const response = await storeRoute("prueba", async () => Response.json({ ok: true }), true);
    expect(await response.json()).toEqual({ ok: true });
  });
});
