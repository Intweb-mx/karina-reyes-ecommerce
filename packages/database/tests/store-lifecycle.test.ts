import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  applyStoreRefund,
  attachStoreCheckoutSession,
  claimStoreConfirmationEmail,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  findStoreOrderByPaymentIntent,
  listStoreOrderEvents,
  listStorePaidWithoutConfirmation,
  listUnsettledStoreOrders,
  markStoreCheckoutExpired,
  markStoreOrderPaid,
  markStoreOrderPaymentMismatch,
  releaseExpiredStoreOrders,
  releaseStoreConfirmationEmail,
  type StoreOrder,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  productId = (await seedProduct(db, { stock: 5 })).id;
});

afterEach(() => close());

const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const stripe = { source: "stripe" as const, externalRef: "evt_1" };

/** Pedido de `quantity` × $500 con sesión vigente 30 min. */
async function placeWithSession(quantity = 2, idempotencyKey: string | null = null): Promise<StoreOrder> {
  const { order } = await createStoreOrder(db, pickupOrder([{ productId, quantity }], { idempotencyKey }), T0);
  return (await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutes(30) }))!;
}

const pay = async (order: StoreOrder) => (await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_1" }, stripe))!.order;

describe("sesión vencida en Stripe", () => {
  it("cancela y libera una sola vez", async () => {
    const order = await placeWithSession();
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: true, order: { paymentStatus: "cancelled", inventoryReserved: false } });
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: false });
    expect(await inventoryOf(db, productId)).toMatchObject({ onHand: 5, reserved: 0 });
    expect((await listStoreOrderEvents(db, order.id)).map((event) => [event.type, event.source])).toContainEqual(["CHECKOUT_EXPIRED", "stripe"]);
  });

  it("no toca un pedido pagado", async () => {
    const order = await pay(await placeWithSession());
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: false, order: { paymentStatus: "paid" } });
  });
});

describe("Stripe cobró un monto distinto", () => {
  const details = { paymentIntentId: "pi_x", expected: { amount: 100_000, currency: "mxn" }, received: { amount: 1, currency: "mxn" } };

  it("no marca pagado: queda pendiente como excepción, conserva el apartado y la liberación automática no lo toca", async () => {
    const order = await placeWithSession();
    expect(await markStoreOrderPaymentMismatch(db, order.id, details, stripe)).toMatchObject({
      changed: true,
      order: { paymentStatus: "pending", fulfillmentStatus: "exception", stripePaymentIntentId: "pi_x", inventoryReserved: true },
    });
    expect(await markStoreOrderPaymentMismatch(db, order.id, details, stripe)).toMatchObject({ changed: false });

    const exceptions = (await listStoreOrderEvents(db, order.id)).filter((event) => event.type === "EXCEPTION");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]!.metadata).toMatchObject({ reason: "amount_mismatch", expected: { amount: 100_000 }, received: { amount: 1 } });

    expect(await releaseExpiredStoreOrders(db, minutes(120))).toBe(0);
    expect(await inventoryOf(db, productId)).toMatchObject({ reserved: 2 });
  });

  it("devuelve null si el pedido no existe", async () => {
    expect(await markStoreOrderPaymentMismatch(db, randomUUID(), details, stripe)).toBeNull();
  });
});

describe("reembolsos informados por Stripe", () => {
  it("parcial y luego total; el acumulado nunca baja y el stock no se toca", async () => {
    const order = await pay(await placeWithSession());
    expect(await applyStoreRefund(db, order.id, 30_000, stripe)).toMatchObject({ changed: true, order: { paymentStatus: "partially_refunded", amountRefunded: 30_000 } });
    expect(await applyStoreRefund(db, order.id, 10_000, stripe)).toMatchObject({ changed: false, order: { amountRefunded: 30_000 } });
    expect(await applyStoreRefund(db, order.id, 100_000, stripe)).toMatchObject({ changed: true, order: { paymentStatus: "refunded", amountRefunded: 100_000 } });

    const types = (await listStoreOrderEvents(db, order.id)).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["PARTIALLY_REFUNDED", "REFUNDED"]));
    expect(await inventoryOf(db, productId)).toMatchObject({ onHand: 3, reserved: 0 });
  });

  it("ignora pedidos sin pagar", async () => {
    const order = await placeWithSession();
    expect(await applyStoreRefund(db, order.id, 10_000, stripe)).toMatchObject({ changed: false, order: { paymentStatus: "pending", amountRefunded: 0 } });
  });
});

describe("búsquedas", () => {
  it("por payment intent y por clave de idempotencia", async () => {
    const order = await pay(await placeWithSession(1, "clave-123456"));
    expect((await findStoreOrderByPaymentIntent(db, "pi_1"))?.id).toBe(order.id);
    expect(await findStoreOrderByPaymentIntent(db, "pi_otro")).toBeNull();
    expect((await findStoreOrderByIdempotencyKey(db, "clave-123456"))?.id).toBe(order.id);
    expect(await findStoreOrderByIdempotencyKey(db, "otra-clave")).toBeNull();
  });

  it("sin resolver: pendientes con sesión creados antes del corte", async () => {
    const withSession = await placeWithSession(1);
    await createStoreOrder(db, pickupOrder([{ productId, quantity: 1 }]), T0);
    await pay(await placeWithSession(1));

    expect((await listUnsettledStoreOrders(db, new Date(Date.now() + 60_000))).map((order) => order.id)).toEqual([withSession.id]);
    expect(await listUnsettledStoreOrders(db, new Date(Date.now() - 60_000))).toEqual([]);
  });
});

describe("correo de confirmación", () => {
  it("solo se reserva para pedidos pagados, una vez, y se puede liberar para reintentar", async () => {
    const order = await placeWithSession(1);
    expect(await claimStoreConfirmationEmail(db, order.id)).toBeNull();

    await pay(order);
    expect(await listStorePaidWithoutConfirmation(db)).toHaveLength(1);
    expect((await claimStoreConfirmationEmail(db, order.id))?.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect(await claimStoreConfirmationEmail(db, order.id)).toBeNull();
    expect(await listStorePaidWithoutConfirmation(db)).toEqual([]);

    await releaseStoreConfirmationEmail(db, order.id);
    expect((await claimStoreConfirmationEmail(db, order.id))?.id).toBe(order.id);
  });
});
