import {
  adjustStock,
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  findStoreOrderBySessionId,
  listStoreOrderEvents,
  markStoreCheckoutCreateFailed,
  markStoreOrderPaid,
  upsertStoreProduct,
  type Database,
} from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeGateway, snapshotFromSession, type CreateStoreCheckoutInput } from "../src/server/presale/gateway.ts";
import { createStoreCheckout, STORE_CHECKOUT_TTL_MINUTES } from "../src/server/store/checkout.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { ADDRESS, FakeGateway, FakeShipping } from "./helpers.ts";
import { AREA, inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0, UNO } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let productId: string;
const deps = (now = T0) => ({ db, gateway, shipping, siteUrl: "https://inttimo.test/", now: () => now });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const body = (overrides: Record<string, unknown> = {}) => ({
  contact: { fullName: "Ana Pérez", email: "Ana@Ejemplo.com" },
  lines: [{ productId, quantity: 2 }],
  delivery: { method: "pickup", pickupPointId: "costco" },
  acceptTerms: true,
  termsVersion: STORE_TERMS_VERSION,
  marketingConsent: false,
  ...overrides,
});

let keys = 0;
const checkout = (overrides: Record<string, unknown> = {}, extra: { key?: string | null; ip?: string | null; now?: Date } = {}) =>
  createStoreCheckout(deps(extra.now), {
    body: body(overrides),
    idempotencyKey: extra.key === undefined ? `clave-prueba-${++keys}` : extra.key,
    clientIp: extra.ip === undefined ? "1.2.3.4" : extra.ip,
  });

async function shippingQuote(quantity = 2) {
  const result = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity }], ...AREA }, clientIp: null });
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  return result.data;
}

const fieldsOf = (result: Awaited<ReturnType<typeof checkout>>) => (result.ok ? {} : (result.body.error.fieldErrors ?? {}));

describe("pasarela de Stripe para la tienda", () => {
  function captureStripe() {
    const calls: { params: Stripe.Checkout.SessionCreateParams; options: Stripe.RequestOptions | undefined }[] = [];
    const expired: string[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
            calls.push({ params, options });
            return { id: "cs_x", url: "https://checkout.stripe.test/x", expires_at: 2_000_000_000 };
          },
          expire: async (id: string) => {
            expired.push(id);
            return { id };
          },
        },
      },
    } as unknown as Stripe;
    return { gateway: createStripeGateway(stripe), calls, expired };
  }

  it("una línea por producto, envío como tarifa fija, metadata de la tienda e idempotencia por pedido", async () => {
    const { gateway, calls, expired } = captureStripe();
    await gateway.createStoreCheckout({
      orderId: "pedido-1",
      orderNumber: "INT-ABCDEFGHJK",
      currency: "mxn",
      lines: [{ name: "UNO+UNO", unitAmount: 50_000, quantity: 2 }],
      deliveryMethod: "shipping",
      shippingAmount: 18_000,
      shippingLabel: "Envío · Estafeta Terrestre",
      email: "a@b.c",
      successUrl: "s",
      cancelUrl: "c",
      expiresAt: new Date(2_000_000_000_000),
    });
    const { params, options } = calls[0]!;
    expect(params.line_items).toEqual([{ quantity: 2, price_data: { currency: "mxn", unit_amount: 50_000, product_data: { name: "UNO+UNO" } } }]);
    expect(params).toMatchObject({ client_reference_id: "pedido-1", metadata: { kind: "store", orderId: "pedido-1", orderNumber: "INT-ABCDEFGHJK" }, success_url: "s", cancel_url: "c", expires_at: 2_000_000_000 });
    expect(params.shipping_options?.[0]?.shipping_rate_data).toMatchObject({ type: "fixed_amount", display_name: "Envío · Estafeta Terrestre", fixed_amount: { amount: 18_000, currency: "mxn" } });
    expect(options).toEqual({ idempotencyKey: "store-checkout-pedido-1" });

    await gateway.expireCheckout("cs_x");
    expect(expired).toEqual(["cs_x"]);
  });

  const session = (overrides: Record<string, unknown>) =>
    ({ id: "cs_1", status: "open", payment_status: "unpaid", payment_intent: null, amount_total: 100, currency: "mxn", collected_information: null, metadata: {}, client_reference_id: null, ...overrides }) as unknown as Stripe.Checkout.Session;

  it("distingue las sesiones de la tienda por metadata.kind; el resto sigue siendo preventa", () => {
    expect(snapshotFromSession(session({ client_reference_id: "pedido-1", metadata: { kind: "store", orderId: "pedido-1" } }))).toMatchObject({ kind: "store", storeOrderId: "pedido-1", reservationId: null });
    expect(snapshotFromSession(session({ client_reference_id: "reserva-1" }))).toMatchObject({ kind: "presale", reservationId: "reserva-1", storeOrderId: null });
  });
});

describe("checkout de la tienda", () => {
  it("recolección: crea el pedido con precios de la base y la sesión de Stripe", async () => {
    const result = await checkout({}, { key: "clave-0001" });
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    expect(result.status).toBe(201);
    expect(result.data.orderNumber).toMatch(/^INT-[2-9A-HJ-NP-Z]{10}$/);
    expect(result.data.checkoutUrl).toBe("https://checkout.stripe.test/cs_test_store_000000000001");

    const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
    expect(order).toMatchObject({ paymentStatus: "pending", deliveryMethod: "pickup", pickupPointId: "costco", email: "ana@ejemplo.com", totalAmount: 100_000, termsVersion: STORE_TERMS_VERSION, idempotencyKey: "clave-0001" });
    expect(gateway.storeCreated[0]).toMatchObject({
      orderId: order.id,
      orderNumber: result.data.orderNumber,
      currency: "mxn",
      lines: [{ name: "UNO+UNO", unitAmount: 50_000, quantity: 2 }],
      deliveryMethod: "pickup",
      shippingAmount: 0,
      shippingLabel: null,
      email: "ana@ejemplo.com",
      successUrl: "https://inttimo.test/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://inttimo.test/checkout?pago=cancelado",
    } satisfies Partial<CreateStoreCheckoutInput>);
    expect(gateway.storeCreated[0]!.expiresAt.getTime() - T0.getTime()).toBe(STORE_CHECKOUT_TTL_MINUTES * 60_000);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 2 });
  });

  it("envío: cobra la tarifa cotizada en el mismo pago", async () => {
    const quote = await shippingQuote();
    const result = await checkout({ delivery: { method: "shipping", quoteId: quote.quoteId, rateId: "express", address: SHIP_ADDRESS } });
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ deliveryMethod: "shipping", shippingAmount: 32_050, shippingLabel: "Envío · DHL Express" });
    const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
    expect(order).toMatchObject({
      shippingAmount: 32_050,
      totalAmount: 132_050,
      deliveryAddress: { name: "Ana Pérez", phone: "6141234567", street: ADDRESS.street, neighborhood: ADDRESS.neighborhood, postalCode: ADDRESS.postalCode, reference: ADDRESS.reference },
      shippingSelection: { provider: "skydropx", rateId: "rate_exp", carrier: "DHL", service: "Express" },
    });
  });

  it("la cotización tiene que coincidir con el carrito y la dirección y seguir vigente", async () => {
    const quote = await shippingQuote();
    const shippingTo = (address: Record<string, unknown>, lines = [{ productId, quantity: 2 }]) => ({ lines, delivery: { method: "shipping", quoteId: quote.quoteId, rateId: "economico", address } });

    const otherPostalCode = await checkout(shippingTo({ ...SHIP_ADDRESS, postalCode: "06700" }));
    expect(otherPostalCode).toMatchObject({ status: 409, body: { error: { code: "quote_expired" } } });
    expect(fieldsOf(otherPostalCode)).toHaveProperty(["address.postalCode"]);

    const otherCart = await checkout(shippingTo(SHIP_ADDRESS, [{ productId, quantity: 3 }]));
    expect(otherCart).toMatchObject({ status: 409, body: { error: { code: "quote_expired", fieldErrors: { shipping: ["Cambiaste tu carrito: vuelve a calcular el envío."] } } } });

    expect(await checkout(shippingTo(SHIP_ADDRESS), { now: minutesAfter(180) })).toMatchObject({ status: 409, body: { error: { code: "quote_expired" } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("errores de validación con las claves que pinta el checkout", async () => {
    const invalid = await checkout({ contact: { fullName: "", email: "no-es-correo" }, delivery: { method: "pickup" }, acceptTerms: false });
    expect(invalid).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(Object.keys(fieldsOf(invalid))).toEqual(expect.arrayContaining(["fullName", "email", "pickupPointId", "acceptTerms"]));

    const noStreet = await checkout({ delivery: { method: "shipping", quoteId: "x", rateId: "economico", address: { ...SHIP_ADDRESS, street: "" } } });
    expect(Object.keys(fieldsOf(noStreet))).toContain("address.street");

    expect(Object.keys(fieldsOf(await checkout({ delivery: undefined })))).toContain("deliveryMethod");
    expect(fieldsOf(await checkout({ delivery: { method: "pickup", pickupPointId: "otro" } }))).toEqual({ pickupPointId: ["Elige el punto de recolección."] });
  });

  it("cupón, versión de términos y campo trampa", async () => {
    expect(await checkout({ couponCode: "VERANO" })).toMatchObject({ status: 422, body: { error: { code: "validation_error", fieldErrors: { couponCode: ["Este cupón no es válido."] } } } });
    expect(await checkout({ termsVersion: STORE_TERMS_VERSION + 1 })).toMatchObject({ status: 409, body: { error: { code: "terms_outdated" } } });
    expect(await checkout({ website: "https://spam.test" })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("una ruta fuera de la lista de claves no genera fieldErrors desconocidos", async () => {
    const known = ["fullName", "email", "phone", "deliveryMethod", "pickupPointId", "shipping", "acceptTerms", "lines", "couponCode"];
    const invalid = await checkout({ termsVersion: "uno", contact: "no-es-objeto", delivery: { method: "shipping", quoteId: "x", rateId: "y", address: "texto" } });
    expect(invalid).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    for (const key of Object.keys(fieldsOf(invalid))) expect(known.includes(key) || key.startsWith("address.")).toBe(true);
    expect(fieldsOf(invalid)).not.toHaveProperty(["termsVersion"]);
    expect(fieldsOf(invalid)).not.toHaveProperty(["contact"]);
    expect(!invalid.ok && invalid.body.error.message).toContain("versión de los términos");
  });

  it("sin stock responde out_of_stock con el nombre del producto; más del máximo es validation_error", async () => {
    // Compradores distintos (el límite de piezas apartadas por comprador no interviene).
    const buyer = (n: number) => ({ contact: { fullName: "Ana Pérez", email: `comprador${n}@ejemplo.com` } });
    expect((await checkout({ ...buyer(1), lines: [{ productId, quantity: 10 }] }, { ip: "10.0.0.1" })).status).toBe(201);
    expect((await checkout({ ...buyer(2), lines: [{ productId, quantity: 10 }] }, { ip: "10.0.0.2" })).status).toBe(201);
    expect(await checkout({ ...buyer(3), lines: [{ productId, quantity: 1 }] }, { ip: "10.0.0.3" })).toMatchObject({
      status: 409,
      body: { error: { code: "out_of_stock", message: "UNO+UNO: Este producto se agotó.", fieldErrors: { lines: ["UNO+UNO: Este producto se agotó."] } } },
    });
    expect(await checkout({ lines: [{ productId, quantity: 11 }] })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });

  it("no vende productos sin precio ni ids desconocidos", async () => {
    expect(await checkout({ lines: [{ productId: "prod_uno_mas_uno", quantity: 1 }] })).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
    await upsertStoreProduct(db, { slug: UNO, name: "UNO+UNO", price: null });
    expect(await checkout()).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
  });

  it("si la ruta caliente no libera lo suficiente, libera en bloque y reintenta una vez", async () => {
    await upsertStoreProduct(db, { slug: UNO, name: "UNO+UNO", maxQuantityPerOrder: 20 });
    // 12 pedidos de 1 pieza, todos vencidos: la ruta caliente libera 10 (quedan 18 libres) y la compra pide 19.
    const held = [];
    for (let n = 0; n < 12; n++) held.push((await createStoreOrder(db, pickupOrderFor(productId, 1), T0)).order);
    for (const order of held) await attachStoreCheckoutSession(db, order.id, { id: `cs_old_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutesAfter(-60) });

    const result = await checkout({ lines: [{ productId, quantity: 19 }] });
    expect(result.status).toBe(201);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 19 });
  });

  it("la misma Idempotency-Key devuelve la misma sesión mientras siga vigente; después, 409", async () => {
    const first = await checkout({}, { key: "clave-repetida" });
    const second = await checkout({}, { key: "clave-repetida" });
    expect(second).toMatchObject({ status: 200, data: { checkoutUrl: first.ok ? first.data.checkoutUrl : "" } });
    expect(gateway.storeCreated).toHaveLength(1);
    expect(await checkout({}, { key: "clave-repetida", now: minutesAfter(40) })).toMatchObject({ status: 409, body: { error: { code: "validation_error" } } });
    expect(await checkout({}, { key: "corta" })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });

  const CHANGED = { status: 409, body: { error: { code: "validation_error", message: "Los datos de esta compra cambiaron. Recarga la página para iniciar una nueva." } } };

  it("misma clave con otro carrito, otro punto u otro correo: 409; idéntica: la misma sesión", async () => {
    const first = await checkout({}, { key: "clave-cambia-recoleccion" });
    if (!first.ok) throw new Error(JSON.stringify(first.body));
    const again = (overrides: Record<string, unknown>) => checkout(overrides, { key: "clave-cambia-recoleccion" });
    expect(await again({ lines: [{ productId, quantity: 3 }] })).toMatchObject(CHANGED);
    expect(await again({ delivery: { method: "pickup", pickupPointId: "sophos-baluarte" } })).toMatchObject(CHANGED);
    expect(await again({ contact: { fullName: "Ana Pérez", email: "otra@ejemplo.com" } })).toMatchObject(CHANGED);
    // Mismo carrito escrito distinto (líneas partidas, id en mayúsculas) y correo con otras mayúsculas: es la misma compra.
    expect(await again({ lines: [{ productId: productId.toUpperCase(), quantity: 1 }, { productId, quantity: 1 }], contact: { fullName: "Ana Pérez", email: "ANA@ejemplo.com" } })).toMatchObject({
      status: 200,
      data: { checkoutUrl: first.data.checkoutUrl },
    });
    expect(gateway.storeCreated).toHaveLength(1);
  });

  it("misma clave con otra dirección, otra tarifa o cambio a recolección: 409; idéntica: la misma sesión", async () => {
    const quote = await shippingQuote();
    const ship = (address: Record<string, unknown> = SHIP_ADDRESS, rateId = "express") => ({ delivery: { method: "shipping", quoteId: quote.quoteId, rateId, address } });
    const key = { key: "clave-cambia-envio" };
    const first = await checkout(ship(), key);
    if (!first.ok) throw new Error(JSON.stringify(first.body));
    expect(await checkout(ship(), key)).toMatchObject({ status: 200, data: { checkoutUrl: first.data.checkoutUrl } });
    expect(await checkout(ship({ ...SHIP_ADDRESS, street: "Otra calle 123" }), key)).toMatchObject(CHANGED);
    expect(await checkout(ship(SHIP_ADDRESS, "economico"), key)).toMatchObject(CHANGED);
    expect(await checkout({ delivery: { method: "pickup", pickupPointId: "costco" } }, key)).toMatchObject(CHANGED);
    expect(gateway.storeCreated).toHaveLength(1);
  });

  it("si Stripe falla, libera el apartado y responde 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.fail = true;
    expect(await checkout({}, { key: "clave-stripe-caido" })).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    expect(await findStoreOrderByIdempotencyKey(db, "clave-stripe-caido")).toMatchObject({ paymentStatus: "failed", inventoryReserved: false });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("el reintento con la misma clave no dice 'ya se procesó' si no se cobró nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.fail = true;
    expect((await checkout({}, { key: "clave-reintento" })).status).toBe(503);
    gateway.fail = false;
    const retry = await checkout({}, { key: "clave-reintento" });
    expect(retry).toMatchObject({ status: 409, body: { error: { code: "validation_error", message: "Este intento de pago no se completó. Recarga la página para intentarlo de nuevo." } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("replay por estado: pagado, preparando y sesión por vencer", async () => {
    const first = await checkout({}, { key: "clave-estados" });
    if (!first.ok) throw new Error("setup");
    const order = (await findStoreOrderByIdempotencyKey(db, "clave-estados"))!;
    // Sesión con menos de 2 minutos de vida: no se ofrece.
    expect(await checkout({}, { key: "clave-estados", now: new Date(order.checkoutExpiresAt!.getTime() - 60_000) })).toMatchObject({ status: 409, body: { error: { message: expect.stringContaining("Este intento de pago no se completó") } } });
    // Pedido pendiente sin sesión ligada todavía (mismos datos que el reintento).
    const { order: bare } = await createStoreOrder(db, pickupOrderFor(productId, 2, { idempotencyKey: "clave-sin-sesion" }), T0);
    expect(bare.stripeCheckoutUrl).toBeNull();
    expect(await checkout({}, { key: "clave-sin-sesion" })).toMatchObject({ status: 409, body: { error: { message: "Estamos preparando tu pago. Espera unos segundos e inténtalo de nuevo." } } });
    // Pagado.
    await db.execute(`update store_orders set payment_status = 'paid' where id = '${order.id}'`);
    expect(await checkout({}, { key: "clave-estados" })).toMatchObject({ status: 409, body: { error: { message: "Esta compra ya se procesó. Recarga la página para iniciar una nueva." } } });
  });

  it("la expiración de Stripe se calcula justo antes de llamar a la pasarela", async () => {
    let calls = 0;
    const clock = () => (calls++ === 0 ? T0 : minutesAfter(5));
    const result = await createStoreCheckout({ ...deps(), now: clock }, { body: body(), idempotencyKey: "clave-reloj-01", clientIp: null });
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]!.expiresAt.getTime()).toBeGreaterThanOrEqual(minutesAfter(5).getTime() + STORE_CHECKOUT_TTL_MINUTES * 60_000);
  });

  it("los errores de Stripe no guardan correos de clientes", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    class EmailGateway extends FakeGateway {
      override async createStoreCheckout(): Promise<never> {
        throw new Error("invalid customer_email ana@ejemplo.com rejected");
      }
    }
    gateway = new EmailGateway();
    await checkout({}, { key: "clave-correo-01" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("ana@ejemplo.com");
    expect(JSON.stringify(spy.mock.calls)).toContain("[correo]");
    const events = await listStoreOrderEvents(db, (await findStoreOrderByIdempotencyKey(db, "clave-correo-01"))!.id);
    expect(JSON.stringify(events)).not.toContain("ana@ejemplo.com");
    expect(JSON.stringify(events)).toContain("[correo]");
  });

  it("marketingConsent inválido responde en español", async () => {
    const result = await checkout({ marketingConsent: "si" });
    expect(result).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(!result.ok && result.body.error.message).toContain("Preferencia de comunicación no válida.");
    expect(!result.ok && result.body.error.message).not.toMatch(/Invalid|expected/);
  });

  it("si el pedido se cerró antes de ligar la sesión, expira la sesión en Stripe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    class ClosingGateway extends FakeGateway {
      override async createStoreCheckout(input: CreateStoreCheckoutInput) {
        await markStoreCheckoutCreateFailed(db, input.orderId, "cerrado en paralelo");
        return super.createStoreCheckout(input);
      }
    }
    gateway = new ClosingGateway();
    expect(await checkout()).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    expect(gateway.expired).toEqual(["cs_test_store_000000000001"]);
  });

  const HELD = { status: 429, body: { error: { code: "rate_limited", message: "Ya tienes piezas apartadas en otra compra. Termina ese pago o espera unos minutos." } } };

  it("límite de piezas apartadas por correo (aunque cambie la IP)", async () => {
    await adjustStock(db, { productId, delta: 30, reason: "reception", actor: "test" });
    expect((await checkout({ lines: [{ productId, quantity: 10 }] }, { ip: "10.0.0.1" })).status).toBe(201);
    expect((await checkout({ lines: [{ productId, quantity: 10 }] }, { ip: "10.0.0.2" })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }], contact: { fullName: "Ana Pérez", email: "ANA@ejemplo.com" } }, { ip: "10.0.0.3" })).toMatchObject(HELD);
    expect(gateway.storeCreated).toHaveLength(2);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 50, reserved: 20 });
    // Otro comprador sí puede comprar.
    expect((await checkout({ lines: [{ productId, quantity: 1 }], contact: { fullName: "Otra", email: "otra@ejemplo.com" } }, { ip: "10.0.0.4" })).status).toBe(201);
  });

  it("límite de piezas apartadas por IP aunque cambie el correo; la IP se guarda solo como hash", async () => {
    await adjustStock(db, { productId, delta: 30, reason: "reception", actor: "test" });
    const as = (n: number, quantity: number) => checkout({ lines: [{ productId, quantity }], contact: { fullName: "Ana Pérez", email: `persona${n}@ejemplo.com` } }, { ip: "9.9.9.9", key: `clave-ip-${n}-x` });
    expect((await as(1, 10)).status).toBe(201);
    expect((await as(2, 10)).status).toBe(201);
    expect(await as(3, 1)).toMatchObject(HELD);
    expect(await checkout({ lines: [{ productId, quantity: 1 }], contact: { fullName: "Ana Pérez", email: "persona4@ejemplo.com" } }, { ip: "8.8.8.8" })).toMatchObject({ status: 201 });
    const order = (await findStoreOrderByIdempotencyKey(db, "clave-ip-1-x"))!;
    expect(order.clientIpHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(order)).not.toContain("9.9.9.9");
  });

  it("las piezas de pedidos pagados o con el apartado vencido no cuentan para el límite", async () => {
    await adjustStock(db, { productId, delta: 30, reason: "reception", actor: "test" });
    const paid = await checkout({ lines: [{ productId, quantity: 10 }] }, { key: "clave-pagada-01" });
    expect(paid.status).toBe(201);
    await markStoreOrderPaid(db, (await findStoreOrderByIdempotencyKey(db, "clave-pagada-01"))!.id, { paymentIntentId: "pi_cap" }, { source: "stripe" });
    expect((await checkout({ lines: [{ productId, quantity: 10 }] })).status).toBe(201);
    // 10 apartadas (vigentes) y 10 pagadas: caben otras 10 apartadas, ni una más.
    expect((await checkout({ lines: [{ productId, quantity: 10 }] })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }] })).toMatchObject(HELD);
    // Cuando vencen esas sesiones (31 min + 5 de gracia), el mismo comprador puede volver a apartar.
    expect((await checkout({ lines: [{ productId, quantity: 10 }] }, { now: minutesAfter(40) })).status).toBe(201);
  });

  it("límite de intentos por IP: 5 cada 10 minutos", async () => {
    for (let n = 0; n < 5; n++) expect((await checkout({ lines: [{ productId, quantity: 1 }], contact: { fullName: "Ana Pérez", email: `ip${n}@ejemplo.com` } })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }], contact: { fullName: "Ana Pérez", email: "ip9@ejemplo.com" } })).toMatchObject({ status: 429, body: { error: { code: "rate_limited", message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." } } });
  });

  it("límite de intentos por correo", async () => {
    for (let n = 0; n < 5; n++) expect((await checkout({ lines: [{ productId, quantity: 1 }] }, { ip: null })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }] }, { ip: null })).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});
