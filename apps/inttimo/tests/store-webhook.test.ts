import { createStoreOrder, findStoreOrderBySessionId, listStoreOrderEvents, releaseExpiredStoreOrders, type Database, type StoreOrder } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeMismatchMail } from "../src/server/store/notifications.ts";
import { handleStripeEvent } from "../src/server/presale/webhook.ts";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping, refundEvent, sessionEvent } from "./helpers.ts";
import { inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;
let order: StoreOrder;
const SESSION = "cs_test_store_000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  const result = await createStoreCheckout(
    { db, gateway: new FakeGateway(), shipping: new FakeShipping(), siteUrl: "https://inttimo.test", now: () => T0 },
    {
      body: { contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" }, lines: [{ productId, quantity: 2 }], delivery: { method: "pickup", pickupPointId: "costco" }, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
      idempotencyKey: "clave-webhook-1",
      clientIp: null,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  order = (await findStoreOrderBySessionId(db, SESSION))!;
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

/** Sesión de la tienda pagada por el total del pedido ($1,000.00). */
const storeSession = (overrides: Partial<Stripe.Checkout.Session> = {}): Partial<Stripe.Checkout.Session> & { id: string } => ({
  id: SESSION,
  status: "complete",
  payment_status: "paid",
  payment_intent: "pi_store_1",
  amount_total: 100_000,
  currency: "mxn",
  client_reference_id: order.id,
  metadata: { kind: "store", orderId: order.id, orderNumber: order.orderNumber },
  ...overrides,
});
const reload = async () => (await findStoreOrderBySessionId(db, SESSION))!;
const eventTypes = async () => (await listStoreOrderEvents(db, order.id)).map((event) => event.type);

describe("webhook de Stripe: pedidos de la tienda", () => {
  it("pago confirmado: marca pagado, descuenta existencias y guarda el payment intent", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()))).toEqual({ result: "applied", storeOrderId: order.id, paymentStatus: "paid" });
    expect(await reload()).toMatchObject({ paymentStatus: "paid", stripePaymentIntentId: "pi_store_1", inventoryReserved: false });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 18, reserved: 0 });
  });

  it("el mismo evento dos veces se aplica una vez; otro evento del mismo pago no cambia nada", async () => {
    const event = sessionEvent("checkout.session.completed", storeSession(), "evt_tienda_1");
    await handleStripeEvent(db, event);
    expect(await handleStripeEvent(db, event)).toEqual({ result: "duplicate" });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()))).toMatchObject({ result: "unchanged", paymentStatus: "paid" });
    expect((await eventTypes()).filter((type) => type === "PAYMENT_APPROVED")).toHaveLength(1);
  });

  it("monto distinto: no marca pagado, deja excepción con su apartado y la liberación no lo toca", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 })))).toMatchObject({ result: "applied", paymentStatus: "pending" });
    expect(await reload()).toMatchObject({ paymentStatus: "pending", fulfillmentStatus: "exception", stripePaymentIntentId: "pi_store_1" });
    expect(await eventTypes()).toContain("EXCEPTION");
    expect(await releaseExpiredStoreOrders(db, minutesAfter(120))).toBe(0);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 2 });
  });

  it("sesión vencida: cancela y libera", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.expired", storeSession({ status: "expired", payment_status: "unpaid", payment_intent: null })))).toMatchObject({ result: "applied", paymentStatus: "cancelled" });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("pago asíncrono rechazado: queda fallido", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ payment_status: "unpaid" })))).toMatchObject({ result: "unchanged", paymentStatus: "pending" });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_failed", storeSession({ payment_status: "unpaid" })))).toMatchObject({ result: "applied", paymentStatus: "failed" });
  });

  it("pago asíncrono confirmado: queda pagado", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ payment_status: "unpaid" })));
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_succeeded", storeSession()))).toMatchObject({ result: "applied", paymentStatus: "paid" });
  });

  it("reembolsos parcial y total por payment intent, sin tocar el stock", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()));
    expect(await handleStripeEvent(db, refundEvent("pi_store_1", 30_000))).toMatchObject({ result: "applied", storeOrderId: order.id, paymentStatus: "partially_refunded" });
    expect(await handleStripeEvent(db, refundEvent("pi_store_1", 100_000))).toMatchObject({ result: "applied", paymentStatus: "refunded" });
    expect(await reload()).toMatchObject({ amountRefunded: 100_000 });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 18, reserved: 0 });
    expect(await handleStripeEvent(db, refundEvent("pi_desconocido", 1))).toEqual({ result: "ignored" });
  });

  it("ignora sesiones de la tienda que no corresponden a un pedido", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ id: "cs_test_otra_sesion" })))).toEqual({ result: "ignored" });
    const unknown = "11111111-1111-4111-8111-111111111111";
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ id: "cs_test_otra_sesion", client_reference_id: unknown, metadata: { kind: "store", orderId: unknown } })))).toEqual({ result: "ignored" });
    expect(await reload()).toMatchObject({ paymentStatus: "pending" });
  });

  it("sesión de la tienda pagada sin pedido: deja un error estructurado sin datos del cliente", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const orphan = storeSession({ id: "cs_test_huerfana", client_reference_id: null, metadata: { kind: "store" }, customer_details: { email: "ana@ejemplo.com", name: "Ana Pérez" } as Stripe.Checkout.Session.CustomerDetails });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", orphan))).toEqual({ result: "ignored" });
    const logs = error.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("store_paid_session_without_order"));
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toMatchObject({ level: "error", msg: "store_paid_session_without_order", sessionId: "cs_test_huerfana", amount: 100_000, currency: "mxn" });
    expect(logs[0]).not.toContain("ana@ejemplo.com");
    expect(logs[0]).not.toContain("Ana");
    // Una sesión sin pagar que no corresponde a un pedido no es una incidencia.
    error.mockClear();
    await handleStripeEvent(db, sessionEvent("checkout.session.expired", storeSession({ id: "cs_test_huerfana_2", status: "expired", payment_status: "unpaid", client_reference_id: null, metadata: { kind: "store" } })));
    expect(error).not.toHaveBeenCalled();
  });

  it("encuentra el pedido por client_reference_id si el webhook llega antes de ligar la sesión", async () => {
    const { order: early } = await createStoreOrder(db, pickupOrderFor(productId, 1), T0);
    const session = storeSession({ id: "cs_test_temprana", amount_total: 50_000, client_reference_id: early.id, metadata: { kind: "store", orderId: early.id } });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", session))).toMatchObject({ result: "applied", storeOrderId: early.id, paymentStatus: "paid" });
  });

  it("monto distinto: el resultado trae el detalle para avisar al equipo y el aviso no lleva datos del cliente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 }), "evt_mismatch_1"));
    expect(outcome).toMatchObject({ mismatch: { orderNumber: order.orderNumber, expected: { amount: 100_000, currency: "mxn" }, received: { amount: 1, currency: "mxn" }, reference: "pi_store_1" } });
    const mail = storeMismatchMail("equipo@ejemplo.com", (outcome as { mismatch: Parameters<typeof storeMismatchMail>[1] }).mismatch);
    expect(mail.to).toBe("equipo@ejemplo.com");
    expect(mail.text).toContain(order.orderNumber);
    expect(mail.text).toContain("pi_store_1");
    expect(mail.text).not.toContain("ana@ejemplo.com");
    // El mismo evento reenviado es duplicado: no vuelve a avisar.
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 }), "evt_mismatch_1"))).toEqual({ result: "duplicate" });
  });

  it("el mismo cobro con monto distinto reenviado en otro evento solo avisa la primera vez", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 }), "evt_mm_a"));
    const second = await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 }), "evt_mm_b"));
    expect(first).toHaveProperty("mismatch");
    expect(second).not.toHaveProperty("mismatch");
  });

  it("monto distinto sobre un pedido ya cancelado: avisa al equipo una sola vez", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await handleStripeEvent(db, sessionEvent("checkout.session.expired", storeSession({ status: "expired", payment_status: "unpaid", payment_intent: null })));
    expect(await reload()).toMatchObject({ paymentStatus: "cancelled" });
    // Igual que la ruta del webhook: un aviso por cada resultado que trae `mismatch`.
    const notices: unknown[] = [];
    const deliver = async (event: Stripe.Event) => {
      const outcome = await handleStripeEvent(db, event);
      if ("storeOrderId" in outcome && outcome.mismatch) notices.push(outcome.mismatch);
      return outcome;
    };
    const event = sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 }), "evt_cancelado_1");
    expect(await deliver(event)).toMatchObject({ result: "unchanged", paymentStatus: "cancelled" });
    expect(notices).toEqual([expect.objectContaining({ orderNumber: order.orderNumber, received: { amount: 1, currency: "mxn" }, reference: "pi_store_1" })]);
    // Reenvío del mismo evento y otro evento del mismo cobro: ninguno vuelve a avisar.
    expect(await deliver(event)).toEqual({ result: "duplicate" });
    await deliver(sessionEvent("checkout.session.async_payment_succeeded", storeSession({ amount_total: 1 }), "evt_cancelado_2"));
    expect(notices).toHaveLength(1);
    expect((await eventTypes()).filter((type) => type === "EXCEPTION")).toHaveLength(1);
  });

  it("reembolso de un pedido aún no pagado: avisa en el log, no cambia nada y responde sin error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Un cobro con monto distinto deja el pedido pendiente (en excepción) pero con su payment intent guardado.
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 })));
    expect(await handleStripeEvent(db, refundEvent("pi_store_1", 30_000))).toMatchObject({ result: "unchanged", storeOrderId: order.id, paymentStatus: "pending" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("store_refund_before_paid"));
    expect(warn.mock.calls[0]![0]).toContain(order.orderNumber);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toMatchObject({ msg: "store_refund_before_paid_needs_review", fulfillmentStatus: "exception" });
    expect(await reload()).toMatchObject({ paymentStatus: "pending", amountRefunded: 0 });
  });
});
