import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../src/client.ts";
import { storeOrders } from "../src/schema/store.ts";
import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderById,
  getExpiredHeldUnits,
  listStoreOrderEvents,
  markStoreOrderPaid,
  releaseExpiredStoreOrders,
  type StoreOrder,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

// Base nueva por prueba: la liberación es global y no debe ver pedidos de otras pruebas.
beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

async function place(productId: string, quantity: number): Promise<StoreOrder> {
  return (await createStoreOrder(db, pickupOrder([{ productId, quantity }]), T0)).order;
}

/** Liga una sesión que vence `offset` minutos después de T0 (negativo = ya venció). */
function expireAt(order: StoreOrder, offset: number) {
  return attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutes(offset) });
}

/** La primera llamada a `select` falla (simula un error en la liberación de la ruta caliente). */
function failingFirstSelect(target: Database): Database {
  let failed = false;
  return new Proxy(target, {
    get(object, property) {
      if (property === "select" && !failed) {
        failed = true;
        return () => {
          throw new Error("liberación rota");
        };
      }
      const value = Reflect.get(object, property, object);
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("unidades apartadas por pedidos vencidos", () => {
  it("las cuenta por producto sin liberar nada", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const old = await place(product.id, 2);
    const live = await place(product.id, 1);
    await expireAt(old, -60);
    await expireAt(live, 30);

    expect((await getExpiredHeldUnits(db, [product.id], T0)).get(product.id)).toBe(2);
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 3 });
    expect((await findStoreOrderById(db, old.id))?.paymentStatus).toBe("pending");
  });

  it("no cuenta pagados ni excepciones; sin productos devuelve un mapa vacío", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const paidOrder = await place(product.id, 1);
    const flagged = await place(product.id, 1);
    await expireAt(paidOrder, -60);
    await expireAt(flagged, -60);
    await markStoreOrderPaid(db, paidOrder.id, {}, { source: "stripe" });
    await db.update(storeOrders).set({ fulfillmentStatus: "exception" }).where(eq(storeOrders.id, flagged.id));

    expect((await getExpiredHeldUnits(db, [product.id], T0)).size).toBe(0);
    expect((await getExpiredHeldUnits(db, [], T0)).size).toBe(0);
  });
});

describe("liberación de apartados vencidos", () => {
  it("procesa primero lo que venció antes y respeta el límite", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const a = await place(product.id, 1);
    const b = await place(product.id, 1);
    const c = await place(product.id, 1);
    await expireAt(a, -10);
    await expireAt(b, -50);
    await expireAt(c, -30);

    expect(await releaseExpiredStoreOrders(db, T0, { limit: 2 })).toBe(2);
    expect((await findStoreOrderById(db, a.id))?.paymentStatus).toBe("pending");
    expect((await findStoreOrderById(db, b.id))?.paymentStatus).toBe("cancelled");
    expect((await findStoreOrderById(db, c.id))?.paymentStatus).toBe("cancelled");
  });

  it("nunca libera un pedido marcado como excepción", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const flagged = await place(product.id, 1);
    await expireAt(flagged, -60);
    await db.update(storeOrders).set({ fulfillmentStatus: "exception" }).where(eq(storeOrders.id, flagged.id));

    expect(await releaseExpiredStoreOrders(db, minutes(60))).toBe(0);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 1 });
  });

  it("anota el origen pedido en el historial", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 1);
    await expireAt(order, -60);

    expect(await releaseExpiredStoreOrders(db, T0, { source: "cli" })).toBe(1);
    const events = (await listStoreOrderEvents(db, order.id)).map((event) => [event.type, event.source]);
    expect(events).toContainEqual(["CHECKOUT_EXPIRED", "cli"]);
    expect(events).toContainEqual(["INVENTORY_RELEASED", "cli"]);
  });

  it("si la liberación falla, la compra sigue y queda en el log", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { order } = await createStoreOrder(failingFirstSelect(db), pickupOrder([{ productId: product.id, quantity: 1 }]), T0);

    expect(order.paymentStatus).toBe("pending");
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("store_release_before_order_failed"));
    errors.mockRestore();
  });
});
