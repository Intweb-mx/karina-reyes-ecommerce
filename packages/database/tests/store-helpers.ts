import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";
import type { Database } from "../src/client.ts";
import { storeInventory } from "../src/schema/store.ts";
import { adjustStock, upsertStoreProduct, type NewStoreOrder, type NewStoreOrderLine, type NewStoreProduct, type StoreProduct } from "../src/store.ts";

/** Producto de prueba a la venta, con existencias iniciales registradas como recepción. */
export async function seedProduct(db: Database, options: { stock?: number } & Partial<NewStoreProduct> = {}): Promise<StoreProduct> {
  const { stock = 5, ...overrides } = options;
  const product = await upsertStoreProduct(db, {
    slug: `producto-${randomUUID().slice(0, 8)}`,
    name: "Producto de prueba",
    published: true,
    saleStatus: "on_sale",
    price: 50_000,
    ...overrides,
  });
  if (stock > 0) await adjustStock(db, { productId: product.id, delta: stock, reason: "reception", actor: "test" });
  return product;
}

/** Pedido de recolección listo para `createStoreOrder`. */
export function pickupOrder(lines: NewStoreOrderLine[], overrides: Partial<NewStoreOrder> = {}): NewStoreOrder {
  return {
    contact: { fullName: "Ana Pérez", email: " Ana@Ejemplo.com ", phone: null },
    lines,
    delivery: { method: "pickup", pickupPointId: "costco" },
    shippingAmount: 0,
    termsVersion: 1,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
    ...overrides,
  };
}

export async function inventoryOf(db: Database, productId: string) {
  const [row] = await db.select().from(storeInventory).where(eq(storeInventory.productId, productId));
  return row!;
}

/** La suma de los movimientos debe igualar las existencias y lo apartado. */
export async function expectLedgerMatches(db: Database, productId: string): Promise<void> {
  const result = await db.execute(
    sql`select coalesce(sum(delta_on_hand), 0)::int as on_hand, coalesce(sum(delta_reserved), 0)::int as reserved from store_stock_movements where product_id = ${productId}`,
  );
  const ledger = (result as unknown as { rows: { on_hand: number; reserved: number }[] }).rows[0]!;
  const inventory = await inventoryOf(db, productId);
  expect({ onHand: ledger.on_hand, reserved: ledger.reserved }).toEqual({ onHand: inventory.onHand, reserved: inventory.reserved });
}
