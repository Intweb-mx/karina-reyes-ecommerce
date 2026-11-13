import { findStoreOrderById, findStoreOrderBySessionId, markStoreOrderPaid, upsertStoreProduct, type Database, type StoreProduct } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCatalog, getProduct, quoteCart } from "../src/server/store/catalog.ts";
import { catalogConfigSchema } from "../src/server/store/catalog-config.ts";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { downloadState, grantDownload, type DownloadStorage } from "../src/server/store/downloads.ts";
import { resendStoreDownloads, sendStoreConfirmationIfNeeded } from "../src/server/store/notifications.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping } from "./helpers.ts";
import { AREA, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

const SITE = "https://inttimo.test";

class FakeStorage implements DownloadStorage {
  signed: { key: string; expiresInSeconds: number; downloadName?: string }[] = [];
  async getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }) {
    this.signed.push({ key, ...options });
    return `https://privado.test/${key}?firma=${this.signed.length}`;
  }
}

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let storage: FakeStorage;
let uno: StoreProduct;
let pdf: StoreProduct;
let sent: Mail[];
const send = async (mail: Mail) => void sent.push(mail);

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  storage = new FakeStorage();
  sent = [];
  uno = await seedStoreProduct(db, { stock: 5 });
  pdf = await upsertStoreProduct(db, {
    slug: "despues-de-la-pregunta",
    name: "Después de la pregunta",
    type: "digital",
    digitalFileKey: "bonus/guia.pdf",
    published: true,
    saleStatus: "on_sale",
    price: 3_000,
    compareAtPrice: 5_000,
    maxQuantityPerOrder: 1,
  });
  await seedStoreSettings(db);
});

afterEach(() => close());

const checkoutBody = (lines: { productId: string; quantity: number }[], delivery: unknown) => ({
  contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" },
  lines,
  delivery,
  acceptTerms: true,
  termsVersion: STORE_TERMS_VERSION,
});
const checkout = (body: unknown) => createStoreCheckout({ db, gateway, shipping, siteUrl: SITE, now: () => T0 }, { body, idempotencyKey: null, clientIp: null });

/** Compra solo del PDF, pagada. */
async function buyPdf() {
  const result = await checkout(checkoutBody([{ productId: pdf.id, quantity: 1 }], { method: "digital" }));
  expect(result.status).toBe(201);
  const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
  await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_1" }, { source: "stripe" });
  return order;
}

const tokenFrom = (mail: Mail) => mail.text.match(/\/descarga\/([A-Za-z0-9_-]{43})/)?.[1];

describe("PDF a la venta (producto digital)", () => {
  it("catálogo: siempre disponible, digital y primero entre los complementos de UNO+UNO", async () => {
    const catalog = await getCatalog({ db, now: () => T0 });
    if (!catalog.ok) throw new Error("catálogo");
    expect(catalog.data.products.find((p) => p.slug === "despues-de-la-pregunta")).toMatchObject({ type: "digital", status: "available", price: { amount: 3_000 }, compareAtPrice: { amount: 5_000 } });
    const detail = await getProduct({ db, now: () => T0 }, "uno-mas-uno");
    if (!detail.ok) throw new Error("detalle");
    expect(detail.data.related[0]).toMatchObject({ slug: "despues-de-la-pregunta" });
    const cart = await quoteCart({ db, now: () => T0 }, { lines: [{ productId: pdf.id, quantity: 3 }] });
    if (!cart.ok) throw new Error("carrito");
    expect(cart.data.lines[0]).toMatchObject({ quantity: 1, digital: true, notice: "Máximo 1 por pedido." });
  });

  it("checkout solo PDF: sin entrega, sin envío en Stripe", async () => {
    const result = await checkout(checkoutBody([{ productId: pdf.id, quantity: 1 }], { method: "digital" }));
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ deliveryMethod: "digital", shippingAmount: 0, shippingLabel: null, lines: [{ unitAmount: 3_000, quantity: 1 }] });
  });

  it("la entrega debe corresponder al carrito", async () => {
    const pdfWithPickup = await checkout(checkoutBody([{ productId: pdf.id, quantity: 1 }], { method: "pickup", pickupPointId: "costco" }));
    expect(pdfWithPickup).toMatchObject({ status: 400, body: { error: { fieldErrors: { deliveryMethod: [expect.stringContaining("solo tiene productos digitales")] } } } });
    const gameDigital = await checkout(checkoutBody([{ productId: uno.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }], { method: "digital" }));
    expect(gameDigital).toMatchObject({ status: 400, body: { error: { fieldErrors: { deliveryMethod: [expect.any(String)] } } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("carrito mixto: el PDF no entra en la caja que se cotiza", async () => {
    const quote = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId: uno.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }], ...AREA }, clientIp: null });
    if (!quote.ok) throw new Error(JSON.stringify(quote.body));
    expect(shipping.quotes[0]!.parcel).toEqual({ weightKg: 1, lengthCm: 16, widthCm: 11, heightCm: 11 });
    const result = await checkout(checkoutBody([{ productId: uno.id, quantity: 1 }, { productId: pdf.id, quantity: 1 }], { method: "shipping", quoteId: quote.data.quoteId, rateId: "express", address: SHIP_ADDRESS }));
    expect(result.status).toBe(201);
    const onlyPdf = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId: pdf.id, quantity: 1 }], ...AREA }, clientIp: null });
    expect(onlyPdf).toMatchObject({ status: 400 });
  });

  it("al pagar: el correo trae un enlace que sirve una vez y el pedido queda entregado", async () => {
    const order = await buyPdf();
    expect(await sendStoreConfirmationIfNeeded(db, order.id, { send, siteUrl: SITE })).toBe("sent");
    const mail = sent[0]!;
    expect(mail.text).toContain("TU DESCARGA DIGITAL");
    expect(mail.text).not.toContain("Envío:");
    expect(mail.html).toMatch(/<a href="https:\/\/inttimo\.test\/descarga\/[A-Za-z0-9_-]{43}">/);
    const token = tokenFrom(mail)!;
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ fulfillmentStatus: "delivered" });

    // Abrir la página no gasta el enlace; pulsar "Descargar" sí.
    expect(await downloadState(db, token)).toMatchObject({ status: "ready" });
    expect(await downloadState(db, token)).toMatchObject({ status: "ready" });
    expect(await grantDownload({ db, storage }, token)).toEqual({ status: "ok", url: "https://privado.test/bonus/guia.pdf?firma=1" });
    expect(storage.signed[0]).toMatchObject({ key: "bonus/guia.pdf", downloadName: "despues-de-la-pregunta.pdf" });
    expect(storage.signed[0]!.expiresInSeconds).toBeLessThanOrEqual(600);
    expect(await grantDownload({ db, storage }, token)).toEqual({ status: "used" });
    expect(await downloadState(db, token)).toMatchObject({ status: "used" });
    expect(await grantDownload({ db, storage }, "corto")).toEqual({ status: "invalid" });
  });

  it("reenvío desde el panel: enlace nuevo al correo de la compra; el anterior sin usar deja de servir", async () => {
    const order = await buyPdf();
    await sendStoreConfirmationIfNeeded(db, order.id, { send, siteUrl: SITE });
    const first = tokenFrom(sent[0]!)!;

    const result = await resendStoreDownloads(db, order.orderNumber.toLowerCase(), { send, siteUrl: SITE, actor: "karina@inttimo.test" });
    expect(result).toEqual({ status: "sent", email: "ana@ejemplo.com" });
    const mail = sent[1]!;
    expect(mail.to).toBe("ana@ejemplo.com");
    const second = tokenFrom(mail)!;
    expect(second).not.toBe(first);
    expect(await grantDownload({ db, storage }, first)).toEqual({ status: "revoked" });
    expect(await grantDownload({ db, storage }, second)).toMatchObject({ status: "ok" });

    expect(await resendStoreDownloads(db, "INT-XXXXXXXXXX", { send, siteUrl: SITE, actor: "k" })).toMatchObject({ status: "not_found" });
  });

  it("archivo de catálogo: un digital necesita su archivo y no puede ser paquete ni llevar envío gratis", () => {
    const base = { slug: "despues-de-la-pregunta", name: "Después de la pregunta", price: 30, saleStatus: "on_sale", published: true };
    expect(catalogConfigSchema.safeParse({ products: [{ ...base, type: "digital", digitalFileKey: "bonus/a.pdf" }] }).success).toBe(true);
    expect(catalogConfigSchema.safeParse({ products: [{ ...base, type: "digital" }] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [{ ...base, digitalFileKey: "bonus/a.pdf" }] }).success).toBe(false);
    expect(catalogConfigSchema.safeParse({ products: [{ ...base, type: "digital", digitalFileKey: "bonus/a.pdf", freeShippingUntil: "2026-12-31T00:00:00-06:00" }] }).success).toBe(false);
  });
});
