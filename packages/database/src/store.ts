import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { Database } from "./client.ts";
import type { Executor } from "./presale.ts";
import { storeInventory, storeOrders, storeProducts, storeStockMovements } from "./schema/store.ts";

export type StoreProduct = typeof storeProducts.$inferSelect;
export type NewStoreProduct = typeof storeProducts.$inferInsert;
export type StoreInventory = typeof storeInventory.$inferSelect;
export type StoreStockMovement = typeof storeStockMovements.$inferSelect;
/** Producto con sus existencias; disponible = existencias − apartado. */
export type StoreProductWithInventory = StoreProduct & { onHand: number; reserved: number; available: number };

// ---------- Productos ----------

/** Crea o actualiza un producto por slug y asegura su fila de inventario (sin tocar las existencias). */
export async function upsertStoreProduct(db: Database, input: NewStoreProduct): Promise<StoreProduct> {
  return db.transaction(async (tx) => {
    const { id: _id, createdAt: _createdAt, ...values } = input;
    const [row] = await tx
      .insert(storeProducts)
      .values(values)
      .onConflictDoUpdate({ target: storeProducts.slug, set: { ...values, updatedAt: new Date() } })
      .returning();
    await tx.insert(storeInventory).values({ productId: row!.id }).onConflictDoNothing();
    return row!;
  });
}

function selectWithInventory(db: Executor) {
  return db
    .select({ ...getTableColumns(storeProducts), onHand: storeInventory.onHand, reserved: storeInventory.reserved })
    .from(storeProducts)
    .innerJoin(storeInventory, eq(storeInventory.productId, storeProducts.id));
}

const withAvailable = <T extends { onHand: number; reserved: number }>(row: T): T & { available: number } => ({ ...row, available: row.onHand - row.reserved });

export async function getStoreProductBySlug(db: Executor, slug: string): Promise<StoreProductWithInventory | null> {
  const [row] = await selectWithInventory(db).where(eq(storeProducts.slug, slug)).limit(1);
  return row ? withAvailable(row) : null;
}

export async function getStoreProductById(db: Executor, id: string): Promise<StoreProductWithInventory | null> {
  const [row] = await selectWithInventory(db).where(eq(storeProducts.id, id)).limit(1);
  return row ? withAvailable(row) : null;
}

export async function listStoreProducts(db: Executor, options: { publishedOnly?: boolean } = {}): Promise<StoreProductWithInventory[]> {
  const rows = await selectWithInventory(db)
    .where(options.publishedOnly ? eq(storeProducts.published, true) : undefined)
    .orderBy(asc(storeProducts.createdAt), asc(storeProducts.slug));
  return rows.map(withAvailable);
}

// ---------- Inventario ----------

export class StoreProductNotFoundError extends Error {
  constructor() {
    super("Producto no encontrado.");
    this.name = "StoreProductNotFoundError";
  }
}

export class InvalidStockAdjustmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStockAdjustmentError";
  }
}

/** El ajuste dejaría las existencias por debajo de lo apartado en pedidos. */
export class StockBelowReservedError extends Error {
  readonly reserved: number;
  constructor(reserved: number) {
    super(`Las existencias no pueden quedar por debajo de lo apartado en pedidos (${reserved}).`);
    this.name = "StockBelowReservedError";
    this.reserved = reserved;
  }
}

/** Motivos de un ajuste manual. Venta, apartado y liberación solo los escribe el sistema. */
export type StockAdjustmentReason = "reception" | "adjustment" | "damage" | "return" | "correction";

/**
 * Ajuste manual de existencias: nunca se sobrescribe el número, siempre queda un movimiento con motivo y autor.
 * Bloquea la fila de inventario durante la transacción.
 */
export async function adjustStock(
  db: Database,
  input: { productId: string; delta: number; reason: StockAdjustmentReason; actor: string; note?: string | null },
): Promise<StoreInventory> {
  const { productId, delta, reason, actor } = input;
  if (!Number.isInteger(delta) || delta === 0) throw new InvalidStockAdjustmentError("El ajuste debe ser un número entero distinto de cero.");
  if ((reason === "reception" || reason === "return") && delta < 0) throw new InvalidStockAdjustmentError("Una recepción o una devolución debe sumar piezas.");
  if (reason === "damage" && delta > 0) throw new InvalidStockAdjustmentError("Una merma debe restar piezas.");

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(storeInventory).where(eq(storeInventory.productId, productId)).for("update");
    if (!current) throw new StoreProductNotFoundError();
    if (current.onHand + delta < current.reserved) throw new StockBelowReservedError(current.reserved);
    const [updated] = await tx
      .update(storeInventory)
      .set({ onHand: current.onHand + delta })
      .where(eq(storeInventory.productId, productId))
      .returning();
    await tx.insert(storeStockMovements).values({ productId, deltaOnHand: delta, deltaReserved: 0, reason, actor, note: input.note ?? null });
    return updated!;
  });
}

/** Movimientos de un producto, del más reciente al más antiguo. */
export async function listStockMovements(db: Executor, productId: string, limit = 100) {
  return db
    .select({
      id: storeStockMovements.id,
      createdAt: storeStockMovements.createdAt,
      deltaOnHand: storeStockMovements.deltaOnHand,
      deltaReserved: storeStockMovements.deltaReserved,
      reason: storeStockMovements.reason,
      actor: storeStockMovements.actor,
      note: storeStockMovements.note,
      orderNumber: storeOrders.orderNumber,
    })
    .from(storeStockMovements)
    .leftJoin(storeOrders, eq(storeOrders.id, storeStockMovements.orderId))
    .where(eq(storeStockMovements.productId, productId))
    .orderBy(desc(storeStockMovements.createdAt), desc(storeStockMovements.id))
    .limit(limit);
}
