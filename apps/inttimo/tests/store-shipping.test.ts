import { getStoreShippingQuote, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPostalCode } from "../src/server/store/postal-code.ts";
import { cartParcel, getDeliveryOptions, quoteStoreShipping, resolveStoreShippingChoice } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeShipping, PICKUP_POINTS, SHIPPING_PROFILE } from "./helpers.ts";
import { AREA, minutesAfter, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let shipping: FakeShipping;
let productId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  shipping = new FakeShipping();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const quote = (overrides: Record<string, unknown> = {}, clientIp: string | null = "7.7.7.7") =>
  quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity: 2 }], ...AREA, ...overrides }, clientIp });

async function quoted() {
  const result = await quote();
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  return result.data;
}

describe("opciones de entrega", () => {
  it("puntos de recolección, envío y versión de términos", async () => {
    expect(await getDeliveryOptions({ db, shipping })).toMatchObject({
      status: 200,
      data: { pickup: { enabled: true, points: PICKUP_POINTS }, shipping: { enabled: true }, termsVersion: STORE_TERMS_VERSION },
    });
  });

  it("sin credenciales de SkyDropX no se ofrece envío", async () => {
    const result = await getDeliveryOptions({ db, shipping: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.shipping.enabled).toBe(false);
  });

  it("con todo apagado no ofrece nada", async () => {
    await seedStoreSettings(db, { pickupEnabled: false, shippingEnabled: false });
    const result = await getDeliveryOptions({ db, shipping });
    expect(result.ok && result.data).toMatchObject({ pickup: { enabled: false, points: [] }, shipping: { enabled: false } });
  });
});

describe("paquete del carrito", () => {
  it("suma pesos, apila alturas y toma el mayor largo y ancho; sin medidas usa el paquete por unidad", () => {
    expect(cartParcel([{ product: { weightGrams: 1000, lengthCm: 16, widthCm: 11, heightCm: 11 }, quantity: 2 }], SHIPPING_PROFILE.parcel)).toEqual({ weightKg: 2, lengthCm: 16, widthCm: 11, heightCm: 22 });
    expect(
      cartParcel(
        [
          { product: { weightGrams: null, lengthCm: null, widthCm: null, heightCm: null }, quantity: 1 },
          { product: { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 5 }, quantity: 2 },
        ],
        SHIPPING_PROFILE.parcel,
      ),
    ).toEqual({ weightKg: 1.8, lengthCm: 30, widthCm: 20, heightCm: 18 });
  });
});

describe("cotizar envío del carrito", () => {
  it("cotiza con SkyDropX, guarda la cotización y devuelve económica y express", async () => {
    const data = await quoted();
    expect(data.rates).toEqual([
      { id: "economico", label: "Envío económico", carrier: "Estafeta", service: "Terrestre", days: 5, price: { amount: 18_000, currency: "mxn" } },
      { id: "express", label: "Envío express", carrier: "DHL", service: "Express", days: 1, price: { amount: 32_050, currency: "mxn" } },
    ]);
    expect(data.expiresAt).toBe(minutesAfter(120).toISOString());
    expect(shipping.quotes[0]).toEqual({ from: SHIPPING_PROFILE.origin, to: AREA, parcel: { weightKg: 2, lengthCm: 16, widthCm: 11, heightCm: 22 }, carriers: [] });
    expect(await getStoreShippingQuote(db, data.quoteId)).toMatchObject({ postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }], currency: "mxn" });
  });

  it("valida la dirección con claves sin prefijo (el checkout agrega address.)", async () => {
    const result = await quote({ postalCode: "123" });
    expect(result).toMatchObject({ status: 400, body: { error: { code: "validation_error", fieldErrors: { postalCode: ["Código postal de 5 dígitos."] } } } });
    expect(await quote({ lines: [] })).toMatchObject({ status: 400, body: { error: { fieldErrors: { lines: ["Tu carrito está vacío."] } } } });
  });

  it("producto que no se vende: out_of_stock", async () => {
    expect(await quote({ lines: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] })).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
  });

  it("envío apagado: service_unavailable", async () => {
    await seedStoreSettings(db, { shippingEnabled: false });
    expect(await quote()).toMatchObject({ status: 409, body: { error: { code: "service_unavailable" } } });
  });

  it("SkyDropX caído: 503; sin tarifas: 422", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    shipping.fail = true;
    expect(await quote()).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    shipping.fail = false;
    shipping.rates = [];
    expect(await quote()).toMatchObject({ status: 422, body: { error: { code: "validation_error" } } });
  });

  it("límite de cotizaciones por IP", async () => {
    for (let i = 0; i < 20; i++) expect((await quote()).status).toBe(200);
    expect(await quote()).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});

describe("tarifa elegida en el checkout", () => {
  it("devuelve el costo y la selección de la cotización guardada", async () => {
    const data = await quoted();
    const choice = await resolveStoreShippingChoice(db, { quoteId: data.quoteId, rateId: "express", postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }] }, T0);
    expect(choice).toMatchObject({ ok: true, amount: 32_050, selection: { provider: "skydropx", quotationId: "quo_1", rateId: "rate_exp", carrier: "DHL", service: "Express", days: 1 } });
  });

  it("rechaza cotizaciones de otro carrito, otro código postal, vencidas o inexistentes", async () => {
    const data = await quoted();
    const base = { quoteId: data.quoteId, rateId: "economico", postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }] };
    expect(await resolveStoreShippingChoice(db, { ...base, postalCode: "06700" }, T0)).toMatchObject({ ok: false, status: 409, code: "quote_expired", field: "address.postalCode" });
    expect(await resolveStoreShippingChoice(db, { ...base, lines: [{ productId, quantity: 3 }] }, T0)).toMatchObject({ ok: false, code: "quote_expired", field: "shipping" });
    expect(await resolveStoreShippingChoice(db, base, minutesAfter(121))).toMatchObject({ ok: false, code: "quote_expired", field: "shipping" });
    expect(await resolveStoreShippingChoice(db, { ...base, quoteId: "x" }, T0)).toMatchObject({ ok: false, code: "quote_expired" });
    expect(await resolveStoreShippingChoice(db, { ...base, rateId: "otra" }, T0)).toMatchObject({ ok: false, status: 400, code: "validation_error", field: "shipping" });
  });
});

describe("código postal", () => {
  it("sin catálogo conectado siempre es 404; si no son 5 dígitos, 400", async () => {
    expect(await lookupPostalCode("31000")).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    expect(await lookupPostalCode("31a")).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });
});
