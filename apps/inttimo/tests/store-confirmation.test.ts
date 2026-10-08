import { findStoreOrderBySessionId, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { getOrderConfirmation } from "../src/server/store/confirmation.ts";
import type { StoreMismatch } from "../src/server/store/settlement.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { ADDRESS, FakeGateway, FakeShipping, PICKUP_POINTS } from "./helpers.ts";
import { AREA, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let productId: string;
const onPaid = vi.fn<(orderId: string) => Promise<void>>(async () => {});
const onMismatch = vi.fn<(mismatch: StoreMismatch) => Promise<void>>(async () => {});
const SESSION = "cs_test_store_000000000001";
const MXN = (amount: number) => ({ amount, currency: "mxn" });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  onPaid.mockClear();
  onMismatch.mockClear();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

async function buy(delivery: Record<string, unknown> = { method: "pickup", pickupPointId: "costco" }) {
  const result = await createStoreCheckout(
    { db, gateway, shipping, siteUrl: "https://inttimo.test", now: () => T0 },
    {
      body: { contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" }, lines: [{ productId, quantity: 2 }], delivery, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
      idempotencyKey: null,
      clientIp: null,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.body));
}

const confirm = (sessionId: string | null = SESSION) => getOrderConfirmation({ db, gateway, onPaid, onMismatch }, sessionId);

describe("confirmación del pedido", () => {
  it("valida el session_id y no encuentra pedidos de otras sesiones", async () => {
    await buy();
    expect(await confirm(null)).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(await confirm("no-es-sesion")).toMatchObject({ status: 400 });
    expect(await confirm("cs_test_store_999999999999")).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
  });

  it("si Stripe ya cobró, lo marca pagado sin esperar al webhook y arma el pedido", async () => {
    await buy();
    gateway.snapshots.set(SESSION, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1" });
    const result = await confirm();
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    expect(gateway.retrieved).toEqual([SESSION]);
    const order = (await findStoreOrderBySessionId(db, SESSION))!;
    expect(result.data).toEqual({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      paymentStatus: "paid",
      fulfillmentStatus: "confirmed",
      lines: [{ name: "UNO+UNO", image: expect.objectContaining({ src: "/images/preventa/uno-mas-uno-caja-y-mazos.jpg" }), quantity: 2, unitPrice: MXN(50_000), subtotal: MXN(100_000) }],
      subtotal: MXN(100_000),
      discount: null,
      shipping: MXN(0),
      total: MXN(100_000),
      delivery: { method: "pickup", pickupPoint: PICKUP_POINTS[1], address: null },
      email: "a***@ejemplo.com",
      shipment: null,
      events: [{ at: expect.any(String), status: "confirmed", description: "Pedido confirmado", location: null }],
    });
    expect(onPaid).toHaveBeenCalledWith(order.id);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("sigue pendiente si el pago no ha llegado; no inventa eventos", async () => {
    await buy();
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending", events: [] } });
    expect(gateway.retrieved).toEqual([SESSION]);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("si Stripe no responde, muestra el último estado conocido", async () => {
    await buy();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.retrieveCheckout = async () => {
      throw new Error("stripe caído");
    };
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending" } });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("store_confirmation_sync_failed"));
  });

  it("monto distinto: no queda pagado y avisa al equipo una sola vez aunque la página sondee varias veces", async () => {
    await buy();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.snapshots.set(SESSION, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1", amountTotal: 1 });
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending" } });
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending" } });
    expect(gateway.retrieved).toEqual([SESSION, SESSION]);
    expect(onPaid).not.toHaveBeenCalled();
    expect(onMismatch).toHaveBeenCalledTimes(1);
    expect(onMismatch).toHaveBeenCalledWith(expect.objectContaining({ expected: MXN(100_000), received: expect.objectContaining({ amount: 1 }) }));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("store_amount_mismatch"));
  });

  it("si el aviso al equipo falla, la confirmación responde igual y se registra", async () => {
    await buy();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.snapshots.set(SESSION, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1", amountTotal: 1 });
    onMismatch.mockRejectedValueOnce(new Error("correo caído"));
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending" } });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("store_confirmation_mismatch_notice_failed"));
  });

  it("envío a domicilio: dirección resumida y costo de envío", async () => {
    const quote = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity: 2 }], ...AREA }, clientIp: null });
    if (!quote.ok) throw new Error(JSON.stringify(quote.body));
    await buy({ method: "shipping", quoteId: quote.data.quoteId, rateId: "economico", address: SHIP_ADDRESS });
    expect(await confirm()).toMatchObject({
      status: 200,
      data: {
        shipping: MXN(18_000),
        total: MXN(118_000),
        delivery: { method: "shipping", pickupPoint: null, address: { name: "Ana Pérez", line1: `${ADDRESS.street}, ${ADDRESS.neighborhood}`, city: ADDRESS.city, state: ADDRESS.state, postalCode: ADDRESS.postalCode } },
      },
    });
  });
});
