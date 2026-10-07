import { randomInt } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import type { EventSource, Executor } from "./presale.ts";
import type { DeliveryAddress, ShippingSelection } from "./schema/presale.ts";
import { storeInventory, storeOrderEvents, storeOrderItems, storeOrderNotes, storeOrders, storeProducts, storeStockMovements, type StoreOrderEventType } from "./schema/store.ts";

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
    .orderBy(desc(storeStockMovements.seq))
    .limit(limit);
}

// ---------- Pedidos ----------

export type StoreOrder = typeof storeOrders.$inferSelect;
export type StoreOrderItem = typeof storeOrderItems.$inferSelect;
export type StoreOrderNote = typeof storeOrderNotes.$inferSelect;

export type NewStoreOrderLine = { productId: string; quantity: number };

export type NewStoreOrder = {
  contact: { fullName: string; email: string; phone: string | null };
  lines: NewStoreOrderLine[];
  delivery: { method: "pickup"; pickupPointId: string } | { method: "shipping"; address: DeliveryAddress; selection: ShippingSelection };
  /** Centavos, ya validados contra la cotización de SkyDropX por quien llama. Debe ser 0 en recolección. */
  shippingAmount: number;
  termsVersion: number;
  marketingConsent: boolean;
  idempotencyKey: string | null;
  attribution: Record<string, string> | null;
};

/** El pedido no es válido (sin productos, cantidad inválida, envío cobrado en recolección…). */
export class InvalidStoreOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStoreOrderError";
  }
}

/** El producto no existe, está oculto, no tiene precio o todavía no se vende. */
export class StoreProductUnavailableError extends Error {
  readonly productId: string;
  constructor(productId: string) {
    super("Este producto no está disponible para compra.");
    this.name = "StoreProductUnavailableError";
    this.productId = productId;
  }
}

/** La cantidad pedida supera lo disponible. */
export class InsufficientStoreStockError extends Error {
  readonly productId: string;
  readonly available: number;
  constructor(productId: string, available: number) {
    super(available === 0 ? "Este producto se agotó." : `Solo quedan ${available} unidades.`);
    this.name = "InsufficientStoreStockError";
    this.productId = productId;
    this.available = available;
  }
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Folio público no secuencial ni adivinable (p. ej. INT-7K2M9QX4TB). */
export function generateOrderNumber(): string {
  let code = "";
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `INT-${code}`;
}

export async function addStoreOrderEvent(
  db: Executor,
  orderId: string,
  type: StoreOrderEventType,
  source: EventSource,
  extra: { actor?: string | null; externalRef?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await db.insert(storeOrderEvents).values({
    orderId,
    type,
    source,
    actor: extra.actor ?? null,
    externalRef: extra.externalRef ?? null,
    metadata: extra.metadata ?? {},
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mergeLines(lines: NewStoreOrderLine[]): NewStoreOrderLine[] {
  const merged = new Map<string, number>();
  for (const raw of lines) {
    const productId = String(raw.productId).toLowerCase();
    if (!UUID_PATTERN.test(productId)) throw new StoreProductUnavailableError(raw.productId);
    const line = { productId, quantity: raw.quantity };
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new InvalidStoreOrderError("La cantidad de cada producto debe ser un entero de 1 o más.");
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => (a.productId < b.productId ? -1 : 1));
}

/**
 * Crea el pedido apartando el stock. Bloquea las filas de inventario de sus productos (ordenadas por id): dos compras
 * simultáneas se serializan y nunca apartan más de lo disponible. El precio sale de la base, nunca de quien llama.
 * Con una `idempotencyKey` ya usada devuelve el pedido existente (`reused: true`) sin apartar otra vez.
 */
export async function createStoreOrder(db: Database, input: NewStoreOrder, now: Date = new Date()): Promise<{ order: StoreOrder; items: StoreOrderItem[]; reused: boolean }> {
  // Libera lo que ya venció antes de contar lo disponible (transacciones separadas; siempre idempotente).
  await releaseExpiredStoreOrders(db, now);
  const lines = mergeLines(input.lines);
  if (!lines.length) throw new InvalidStoreOrderError("El pedido no tiene productos.");
  if (input.delivery.method === "pickup" && input.shippingAmount !== 0) throw new InvalidStoreOrderError("La recolección no tiene costo de envío.");
  if (!Number.isInteger(input.shippingAmount) || input.shippingAmount < 0) throw new InvalidStoreOrderError("El costo de envío no es válido.");
  const productIds = lines.map((line) => line.productId);

  return db.transaction(async (tx) => {
    // Orden de bloqueo: candado de la clave (solo pedidos con clave) → filas de inventario por product_id → fila del pedido.
    // Ninguna otra función de este módulo toma candados advisory, así que no hay ciclos. Sin él, dos peticiones con la misma
    // clave y carritos distintos no comparten fila de inventario y la segunda fallaría con un UNIQUE crudo en idempotency_key.
    if (input.idempotencyKey) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`);
    const inventory = await tx.select().from(storeInventory).where(inArray(storeInventory.productId, productIds)).orderBy(asc(storeInventory.productId)).for("update");

    // Con el inventario bloqueado, dos peticiones con la misma clave se serializan: la segunda ya ve el pedido de la primera.
    if (input.idempotencyKey) {
      const [existing] = await tx.select().from(storeOrders).where(eq(storeOrders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) return { order: existing, items: await tx.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, existing.id)), reused: true };
    }

    const stock = new Map(inventory.map((row) => [row.productId, row]));
    const products = new Map((await tx.select().from(storeProducts).where(inArray(storeProducts.id, productIds))).map((row) => [row.id, row]));

    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product || !stock.has(line.productId) || !product.published || product.price === null || product.saleStatus === "coming_soon") {
        throw new StoreProductUnavailableError(line.productId);
      }
    }
    for (const line of lines) {
      const product = products.get(line.productId)!;
      if (line.quantity > product.maxQuantityPerOrder) throw new InvalidStoreOrderError(`Máximo ${product.maxQuantityPerOrder} por pedido de ${product.name}.`);
    }
    for (const line of lines) {
      const row = stock.get(line.productId)!;
      const available = row.onHand - row.reserved;
      if (line.quantity > available) throw new InsufficientStoreStockError(line.productId, available);
    }
    const currencies = new Set(lines.map((line) => products.get(line.productId)!.currency));
    if (currencies.size > 1) throw new InvalidStoreOrderError("Los productos del pedido usan monedas distintas.");

    const subtotal = lines.reduce((sum, line) => sum + products.get(line.productId)!.price! * line.quantity, 0);
    const delivery = input.delivery;
    const [order] = await tx
      .insert(storeOrders)
      .values({
        orderNumber: generateOrderNumber(),
        fullName: input.contact.fullName.trim(),
        email: input.contact.email.trim().toLowerCase(),
        phone: input.contact.phone,
        deliveryMethod: delivery.method,
        pickupPointId: delivery.method === "pickup" ? delivery.pickupPointId : null,
        deliveryAddress: delivery.method === "shipping" ? delivery.address : null,
        shippingSelection: delivery.method === "shipping" ? delivery.selection : null,
        subtotalAmount: subtotal,
        shippingAmount: input.shippingAmount,
        totalAmount: subtotal + input.shippingAmount,
        currency: [...currencies][0]!,
        termsVersion: input.termsVersion,
        termsAcceptedAt: now,
        marketingConsent: input.marketingConsent,
        idempotencyKey: input.idempotencyKey,
        attribution: input.attribution,
        inventoryReserved: true,
      })
      .returning();

    const items = await tx
      .insert(storeOrderItems)
      .values(
        lines.map((line) => {
          const product = products.get(line.productId)!;
          return { orderId: order!.id, productId: product.id, productSlug: product.slug, sku: product.sku, name: product.name, quantity: line.quantity, unitAmount: product.price! };
        }),
      )
      .returning();

    for (const line of lines) {
      await tx
        .update(storeInventory)
        .set({ reserved: sql`${storeInventory.reserved} + ${line.quantity}` })
        .where(eq(storeInventory.productId, line.productId));
      await tx.insert(storeStockMovements).values({ productId: line.productId, deltaOnHand: 0, deltaReserved: line.quantity, reason: "reservation", orderId: order!.id, actor: "system" });
    }

    await addStoreOrderEvent(tx, order!.id, "ORDER_CREATED", "api", { metadata: { units: lines.reduce((sum, line) => sum + line.quantity, 0), totalAmount: order!.totalAmount } });
    await addStoreOrderEvent(tx, order!.id, "INVENTORY_RESERVED", "api", { metadata: { lines } });
    return { order: order!, items, reused: false };
  });
}

/** Liga la sesión de Stripe Checkout al pedido (una sola vez, mientras siga pendiente). */
export async function attachStoreCheckoutSession(db: Database, orderId: string, session: { id: string; url: string; expiresAt: Date }): Promise<StoreOrder | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(storeOrders)
      .set({ stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url, checkoutExpiresAt: session.expiresAt })
      .where(and(eq(storeOrders.id, orderId), eq(storeOrders.paymentStatus, "pending"), isNull(storeOrders.stripeCheckoutSessionId)))
      .returning();
    if (row) await addStoreOrderEvent(tx, row.id, "CHECKOUT_CREATED", "api", { externalRef: session.id });
    return row ?? null;
  });
}

export async function findStoreOrderById(db: Executor, id: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
  return row ?? null;
}

export async function findStoreOrderByNumber(db: Executor, orderNumber: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.orderNumber, orderNumber)).limit(1);
  return row ?? null;
}

export async function findStoreOrderBySessionId(db: Executor, sessionId: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.stripeCheckoutSessionId, sessionId)).limit(1);
  return row ?? null;
}

export async function listStoreOrderItems(db: Executor, orderId: string): Promise<StoreOrderItem[]> {
  return db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, orderId)).orderBy(asc(storeOrderItems.productSlug));
}

export async function listStoreOrderEvents(db: Executor, orderId: string) {
  return db.select().from(storeOrderEvents).where(eq(storeOrderEvents.orderId, orderId)).orderBy(asc(storeOrderEvents.seq));
}

export async function addStoreOrderNote(db: Executor, input: { orderId: string; body: string; authorEmail: string }): Promise<StoreOrderNote> {
  const [row] = await db.insert(storeOrderNotes).values(input).returning();
  return row!;
}

export async function listStoreOrderNotes(db: Executor, orderId: string): Promise<StoreOrderNote[]> {
  return db.select().from(storeOrderNotes).where(eq(storeOrderNotes.orderId, orderId)).orderBy(asc(storeOrderNotes.seq));
}

// ---------- Ciclo de pago y liberación de stock ----------

type StoreTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Minutos extra después de que vence la sesión de Stripe antes de liberar el apartado (un webhook puede llegar tarde). */
export const STORE_HOLD_GRACE_MINUTES = 5;

/**
 * Bloquea en el orden único del módulo: primero el inventario de los productos del pedido (por id) y después la fila del
 * pedido. Las líneas de un pedido no cambian después de crearse, así que leerlas sin bloqueo es seguro.
 */
async function lockOrderAndInventory(tx: StoreTx, orderId: string): Promise<{ order: StoreOrder; items: StoreOrderItem[]; inventory: Map<string, StoreInventory> } | null> {
  const items = await tx.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, orderId));
  const productIds = items.map((item) => item.productId);
  const rows = productIds.length ? await tx.select().from(storeInventory).where(inArray(storeInventory.productId, productIds)).orderBy(asc(storeInventory.productId)).for("update") : [];
  const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
  if (!order) return null;
  return { order, items, inventory: new Map(rows.map((row) => [row.productId, row])) };
}

/** Libera las unidades apartadas de un pedido. Solo dentro de una transacción que ya bloqueó inventario y pedido. */
async function releaseReservedStock(tx: StoreTx, order: StoreOrder, items: StoreOrderItem[], source: EventSource): Promise<void> {
  for (const item of items) {
    await tx
      .update(storeInventory)
      .set({ reserved: sql`${storeInventory.reserved} - ${item.quantity}` })
      .where(eq(storeInventory.productId, item.productId));
    await tx.insert(storeStockMovements).values({ productId: item.productId, deltaOnHand: 0, deltaReserved: -item.quantity, reason: "release", orderId: order.id, actor: "system" });
  }
  await tx.update(storeOrders).set({ inventoryReserved: false }).where(eq(storeOrders.id, order.id));
  await addStoreOrderEvent(tx, order.id, "INVENTORY_RELEASED", source);
}

export type StorePaidOutcome = "paid" | "already_paid" | "paid_oversold";

/**
 * Pago confirmado (webhook o reconciliación). Idempotente: un pedido ya pagado no cambia. Si el apartado seguía vigente
 * descuenta las existencias; si ya se había liberado intenta vender directo, y si no hay stock deja el pedido pagado y
 * marcado como excepción (hay que reembolsarlo): nunca se vende lo que no existe ni se pierde un pago en silencio.
 */
export async function markStoreOrderPaid(
  db: Database,
  orderId: string,
  details: { paymentIntentId?: string | null },
  ctx: { source: EventSource; externalRef?: string | null },
  now: Date = new Date(),
): Promise<{ order: StoreOrder; outcome: StorePaidOutcome } | null> {
  return db.transaction(async (tx) => {
    const locked = await lockOrderAndInventory(tx, orderId);
    if (!locked) return null;
    const { order, items, inventory } = locked;
    if (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded" || order.paymentStatus === "refunded") return { order, outcome: "already_paid" as const };

    let outcome: StorePaidOutcome = "paid";
    let fulfillmentStatus = order.fulfillmentStatus;
    if (order.inventoryReserved) {
      for (const item of items) {
        await tx
          .update(storeInventory)
          .set({ onHand: sql`${storeInventory.onHand} - ${item.quantity}`, reserved: sql`${storeInventory.reserved} - ${item.quantity}` })
          .where(eq(storeInventory.productId, item.productId));
        await tx.insert(storeStockMovements).values({ productId: item.productId, deltaOnHand: -item.quantity, deltaReserved: -item.quantity, reason: "sale", orderId: order.id, actor: "system" });
      }
    } else if (items.every((item) => {
      const row = inventory.get(item.productId);
      return !!row && row.onHand - row.reserved >= item.quantity;
    })) {
      for (const item of items) {
        await tx
          .update(storeInventory)
          .set({ onHand: sql`${storeInventory.onHand} - ${item.quantity}` })
          .where(eq(storeInventory.productId, item.productId));
        await tx.insert(storeStockMovements).values({ productId: item.productId, deltaOnHand: -item.quantity, deltaReserved: 0, reason: "sale", orderId: order.id, actor: "system" });
      }
    } else {
      outcome = "paid_oversold";
      fulfillmentStatus = "exception";
    }

    const [updated] = await tx
      .update(storeOrders)
      .set({
        paymentStatus: "paid",
        paidAt: now,
        inventoryReserved: false,
        fulfillmentStatus,
        stripePaymentIntentId: details.paymentIntentId ?? order.stripePaymentIntentId,
      })
      .where(eq(storeOrders.id, order.id))
      .returning();
    await addStoreOrderEvent(tx, order.id, "PAYMENT_APPROVED", ctx.source, { externalRef: ctx.externalRef ?? null });
    if (outcome === "paid_oversold") {
      await addStoreOrderEvent(tx, order.id, "EXCEPTION", ctx.source, { metadata: { reason: "oversold_after_release" } });
    } else {
      await addStoreOrderEvent(tx, order.id, "INVENTORY_COMMITTED", ctx.source);
    }
    return { order: updated!, outcome };
  });
}

/** Cierra un pedido que seguía pendiente: libera lo apartado (una sola vez) y registra el motivo. */
async function closePendingOrder(
  db: Database,
  orderId: string,
  close: { paymentStatus: "failed" | "cancelled"; event: StoreOrderEventType; source: EventSource; metadata?: Record<string, unknown>; onlyIfHoldExpiredBefore?: Date },
): Promise<{ order: StoreOrder; changed: boolean } | null> {
  return db.transaction(async (tx) => {
    const locked = await lockOrderAndInventory(tx, orderId);
    if (!locked) return null;
    const { order, items } = locked;
    const stillExpired = !close.onlyIfHoldExpiredBefore || (order.checkoutExpiresAt ?? order.createdAt) < close.onlyIfHoldExpiredBefore;
    if (order.paymentStatus !== "pending" || !stillExpired) return { order, changed: false };
    await tx.update(storeOrders).set({ paymentStatus: close.paymentStatus }).where(eq(storeOrders.id, orderId));
    await addStoreOrderEvent(tx, orderId, close.event, close.source, { metadata: close.metadata });
    if (order.inventoryReserved) await releaseReservedStock(tx, order, items, close.source);
    const [updated] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId));
    return { order: updated!, changed: true };
  });
}

/** Pago rechazado: el pedido queda fallido y se libera el apartado. */
export function markStoreOrderPaymentFailed(db: Database, orderId: string, ctx: { source: EventSource }) {
  return closePendingOrder(db, orderId, { paymentStatus: "failed", event: "PAYMENT_FAILED", source: ctx.source });
}

/** No se pudo crear la sesión de pago (error técnico): libera el apartado y guarda el motivo. */
export function markStoreCheckoutCreateFailed(db: Database, orderId: string, reason: string) {
  return closePendingOrder(db, orderId, { paymentStatus: "failed", event: "CHECKOUT_CREATE_FAILED", source: "api", metadata: { reason: reason.slice(0, 300) } });
}

/**
 * Libera los pedidos pendientes cuyo apartado venció (sesión vencida más la gracia, o 5 minutos sin sesión). Procesa hasta
 * 100 por llamada. Quien lea disponibilidad (catálogo, carrito) debe llamarla antes; `createStoreOrder` ya lo hace.
 */
export async function releaseExpiredStoreOrders(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STORE_HOLD_GRACE_MINUTES * 60_000);
  const expired = await db
    .select({ id: storeOrders.id })
    .from(storeOrders)
    .where(
      and(
        eq(storeOrders.paymentStatus, "pending"),
        eq(storeOrders.inventoryReserved, true),
        or(lt(storeOrders.checkoutExpiresAt, cutoff), and(isNull(storeOrders.checkoutExpiresAt), lt(storeOrders.createdAt, cutoff))),
      ),
    )
    .limit(100);
  let released = 0;
  for (const { id } of expired) {
    const result = await closePendingOrder(db, id, { paymentStatus: "cancelled", event: "CHECKOUT_EXPIRED", source: "api", onlyIfHoldExpiredBefore: cutoff });
    if (result?.changed) released++;
  }
  return released;
}
