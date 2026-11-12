import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  adjustStock,
  createStoreOrder,
  getExpiredHeldUnits,
  getStoreHeldUnits,
  getStoreProductById,
  InsufficientStoreStockError,
  InvalidStockAdjustmentError,
  InvalidStoreProductError,
  markStoreCheckoutExpired,
  markStoreOrderPaid,
  upsertStoreProduct,
  type StoreProduct,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

/** Producto base con `stock` piezas y un paquete de `units` piezas que descuenta de él. */
async function baseWithBundle(stock: number, units: number): Promise<{ base: StoreProduct; bundle: StoreProduct }> {
  const base = await seedProduct(db, { stock, price: 47_214 });
  const bundle = await upsertStoreProduct(db, {
    slug: `paquete-${randomUUID().slice(0, 8)}`,
    name: `Paquete de ${units}`,
    published: true,
    saleStatus: "on_sale",
    price: 90_000,
    stockProductId: base.id,
    stockUnits: units,
  });
  return { base, bundle };
}

describe("paquetes", () => {
  it("el disponible del paquete son paquetes completos de las piezas libres del producto base", async () => {
    const { base, bundle } = await baseWithBundle(13, 6);
    expect(await getStoreProductById(db, bundle.id)).toMatchObject({ onHand: 13, reserved: 0, available: 2 });
    expect(await getStoreProductById(db, base.id)).toMatchObject({ available: 13 });
  });

  it("apartar, pagar y liberar mueven piezas del producto base; el ledger cuadra", async () => {
    const { base, bundle } = await baseWithBundle(20, 6);

    const paid = await createStoreOrder(db, pickupOrder([{ productId: bundle.id, quantity: 2 }]));
    expect(paid.items[0]).toMatchObject({ stockProductId: base.id, stockUnits: 6, unitAmount: 90_000 });
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 20, reserved: 12 });
    await markStoreOrderPaid(db, paid.order.id, {}, { source: "stripe" });
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 8, reserved: 0 });

    const expired = await createStoreOrder(db, pickupOrder([{ productId: bundle.id, quantity: 1 }]));
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 8, reserved: 6 });
    await markStoreCheckoutExpired(db, expired.order.id, { source: "stripe" });
    expect(await inventoryOf(db, base.id)).toMatchObject({ onHand: 8, reserved: 0 });

    // El paquete nunca tiene movimientos propios.
    expect(await inventoryOf(db, bundle.id)).toMatchObject({ onHand: 0, reserved: 0 });
    await expectLedgerMatches(db, base.id);
  });

  it("producto suelto y paquete en el mismo carrito compiten por las mismas piezas", async () => {
    const { base, bundle } = await baseWithBundle(7, 6);
    await expect(createStoreOrder(db, pickupOrder([{ productId: base.id, quantity: 2 }, { productId: bundle.id, quantity: 1 }]))).rejects.toBeInstanceOf(InsufficientStoreStockError);
    const ok = await createStoreOrder(db, pickupOrder([{ productId: base.id, quantity: 1 }, { productId: bundle.id, quantity: 1 }]));
    expect(ok.reused).toBe(false);
    expect(await inventoryOf(db, base.id)).toMatchObject({ reserved: 7 });
    await expectLedgerMatches(db, base.id);
  });

  it("sin piezas suficientes para un paquete completo, avisa cuántos paquetes quedan", async () => {
    const { bundle } = await baseWithBundle(11, 6);
    const error = await createStoreOrder(db, pickupOrder([{ productId: bundle.id, quantity: 2 }])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientStoreStockError);
    expect((error as InsufficientStoreStockError).available).toBe(1);
  });

  it("apartados vencidos y piezas por comprador se cuentan en piezas del producto base", async () => {
    const { base, bundle } = await baseWithBundle(30, 10);
    const email = `iglesia-${randomUUID().slice(0, 6)}@ejemplo.com`;
    const created = new Date(); // created_at lo pone la base con la hora real
    await createStoreOrder(db, pickupOrder([{ productId: bundle.id, quantity: 2 }], { contact: { fullName: "Iglesia", email, phone: null } }), created);
    expect(await getStoreHeldUnits(db, { email }, created)).toBe(20);
    const later = new Date(created.getTime() + 60 * 60_000);
    expect((await getExpiredHeldUnits(db, [base.id], later)).get(base.id)).toBe(20);
  });

  it("no se ajustan existencias de un paquete ni se encadenan paquetes", async () => {
    const { bundle } = await baseWithBundle(5, 2);
    await expect(adjustStock(db, { productId: bundle.id, delta: 3, reason: "reception", actor: "test" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(upsertStoreProduct(db, { slug: `x-${randomUUID().slice(0, 8)}`, name: "Paquete de paquete", stockProductId: bundle.id, stockUnits: 2 })).rejects.toBeInstanceOf(InvalidStoreProductError);
  });
});
