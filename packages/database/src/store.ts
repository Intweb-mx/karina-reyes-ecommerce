import { randomInt } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import type { EventSource, Executor } from "./presale.ts";
import { presaleCampaigns, type DeliveryAddress, type ShippingSelection } from "./schema/presale.ts";
import {
  storeInventory,
  storeOrderEvents,
  storeOrderItems,
  storeOrderNotes,
  storeOrders,
  storeProducts,
  storeSettings,
  storeShippingQuotes,
  storeStockMovements,
  type StoreOrderEventType,
} from "./schema/store.ts";

export type StoreProduct = typeof storeProducts.$inferSelect;
export type NewStoreProduct = typeof storeProducts.$inferInsert;
export type StoreInventory = typeof storeInventory.$inferSelect;
export type StoreStockMovement = typeof storeStockMovements.$inferSelect;
/**
 * Producto con sus existencias; disponible = existencias − apartado. En un paquete, existencias y apartado son piezas de
 * su producto base y disponible se cuenta en paquetes completos (⌊piezas libres ÷ piezas por paquete⌋).
 */
export type StoreProductWithInventory = StoreProduct & { onHand: number; reserved: number; available: number };

/** Inventario que descuenta un producto: el suyo o, si es un paquete, el de su producto base. */
export const stockKeyOf = (product: Pick<StoreProduct, "id" | "stockProductId">): string => product.stockProductId ?? product.id;

/**
 * Precio que se cobra en `now`: con el descuento de temporada vencido (`saleEndsAt`) se cobra el precio normal
 * (`compareAtPrice`) y ya no hay tachado. Catálogo, carrito y pedido usan esta misma función.
 */
export function currentPrice(
  product: Pick<StoreProduct, "price" | "compareAtPrice" | "saleEndsAt">,
  now: Date,
): { price: number | null; compareAtPrice: number | null } {
  if (product.saleEndsAt && product.compareAtPrice !== null && now >= product.saleEndsAt) return { price: product.compareAtPrice, compareAtPrice: null };
  return { price: product.price, compareAtPrice: product.compareAtPrice };
}

/** El producto no se puede guardar así (p. ej. un paquete de otro paquete). */
export class InvalidStoreProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStoreProductError";
  }
}

// ---------- Productos ----------

/** Crea o actualiza un producto por slug y asegura su fila de inventario (sin tocar las existencias). */
export async function upsertStoreProduct(db: Database, input: NewStoreProduct): Promise<StoreProduct> {
  return db.transaction(async (tx) => {
    const { id: _id, createdAt: _createdAt, ...values } = input;
    if (values.stockProductId) {
      const [base] = await tx.select({ slug: storeProducts.slug, stockProductId: storeProducts.stockProductId }).from(storeProducts).where(eq(storeProducts.id, values.stockProductId)).limit(1);
      if (!base) throw new InvalidStoreProductError("El producto base del paquete no existe.");
      if (base.stockProductId) throw new InvalidStoreProductError("Un paquete no puede descontar de otro paquete.");
      if (base.slug === values.slug) throw new InvalidStoreProductError("Un paquete no puede descontar de sí mismo.");
    }
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
    .innerJoin(storeInventory, eq(storeInventory.productId, sql`coalesce(${storeProducts.stockProductId}, ${storeProducts.id})`));
}

const withAvailable = <T extends { onHand: number; reserved: number; stockUnits: number }>(row: T): T & { available: number } => ({
  ...row,
  available: Math.floor((row.onHand - row.reserved) / row.stockUnits),
});

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
    const [product] = await tx.select({ stockProductId: storeProducts.stockProductId }).from(storeProducts).where(eq(storeProducts.id, productId)).limit(1);
    if (product?.stockProductId) throw new InvalidStockAdjustmentError("Este paquete descuenta del inventario de su producto base: ajusta las existencias de ese producto.");
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
  /** Hash de la IP de quien compra (nunca la IP en claro). */
  clientIpHash?: string | null;
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

type StockLine = { productId: string; quantity: number; stockProductId: string | null; stockUnits: number };

/** Piezas que mueve cada inventario (un paquete cuenta sus piezas en el de su producto base), ordenadas por id. */
function stockUnitsByKey(lines: StockLine[]): Map<string, number> {
  const units = new Map<string, number>();
  for (const line of lines) {
    const key = line.stockProductId ?? line.productId;
    units.set(key, (units.get(key) ?? 0) + line.quantity * line.stockUnits);
  }
  return new Map([...units].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Crea el pedido apartando el stock. Bloquea las filas de inventario de sus productos (ordenadas por id): dos compras
 * simultáneas se serializan y nunca apartan más de lo disponible. El precio sale de la base, nunca de quien llama.
 * Con una `idempotencyKey` ya usada devuelve el pedido existente (`reused: true`) sin apartar otra vez.
 */
export async function createStoreOrder(db: Database, input: NewStoreOrder, now: Date = new Date()): Promise<{ order: StoreOrder; items: StoreOrderItem[]; reused: boolean }> {
  // Libera lo vencido antes de contar lo disponible: pocos pedidos, del que venció antes al más reciente. Un error de
  // liberación nunca aborta la compra (la liberación en bloque la hacen el reintento del checkout y `store:reconcile`).
  try {
    await releaseExpiredStoreOrders(db, now, { limit: STORE_CHECKOUT_RELEASE_LIMIT });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_release_before_order_failed", error: String(error).slice(0, 300) }));
  }
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
    // Los productos se leen antes (sin bloqueo) para saber qué inventario bloquear: un paquete usa el de su producto base.
    // El precio es el vigente en `now` (el descuento de temporada puede haber vencido).
    const products = new Map(
      (await tx.select().from(storeProducts).where(inArray(storeProducts.id, productIds))).map((row) => [row.id, { ...row, ...currentPrice(row, now) }]),
    );
    const stockIds = [...new Set(lines.map((line) => { const product = products.get(line.productId); return product ? stockKeyOf(product) : line.productId; }))];
    const inventory = await tx.select().from(storeInventory).where(inArray(storeInventory.productId, stockIds)).orderBy(asc(storeInventory.productId)).for("update");

    // Con el inventario bloqueado, dos peticiones con la misma clave se serializan: la segunda ya ve el pedido de la primera.
    if (input.idempotencyKey) {
      const [existing] = await tx.select().from(storeOrders).where(eq(storeOrders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) return { order: existing, items: await tx.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, existing.id)), reused: true };
    }

    const stock = new Map(inventory.map((row) => [row.productId, row]));

    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product || !stock.has(stockKeyOf(product)) || !product.published || product.price === null || product.saleStatus === "coming_soon") {
        throw new StoreProductUnavailableError(line.productId);
      }
    }
    for (const line of lines) {
      const product = products.get(line.productId)!;
      if (line.quantity > product.maxQuantityPerOrder) throw new InvalidStoreOrderError(`Máximo ${product.maxQuantityPerOrder} por pedido de ${product.name}.`);
    }
    // Piezas por inventario: UNO+UNO suelto y un dúo en el mismo carrito compiten por las mismas piezas.
    const pieces = stockUnitsByKey(lines.map((line) => ({ ...line, stockProductId: products.get(line.productId)!.stockProductId, stockUnits: products.get(line.productId)!.stockUnits })));
    for (const line of lines) {
      const product = products.get(line.productId)!;
      const row = stock.get(stockKeyOf(product))!;
      const free = row.onHand - row.reserved;
      if (pieces.get(stockKeyOf(product))! > free) throw new InsufficientStoreStockError(line.productId, Math.max(0, Math.floor(free / product.stockUnits)));
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
        clientIpHash: input.clientIpHash ?? null,
        inventoryReserved: true,
      })
      .returning();

    const items = await tx
      .insert(storeOrderItems)
      .values(
        lines.map((line) => {
          const product = products.get(line.productId)!;
          return {
            orderId: order!.id,
            productId: product.id,
            productSlug: product.slug,
            sku: product.sku,
            name: product.name,
            quantity: line.quantity,
            unitAmount: product.price!,
            stockProductId: product.stockProductId,
            stockUnits: product.stockUnits,
          };
        }),
      )
      .returning();

    for (const [productId, units] of pieces) {
      await tx
        .update(storeInventory)
        .set({ reserved: sql`${storeInventory.reserved} + ${units}` })
        .where(eq(storeInventory.productId, productId));
      await tx.insert(storeStockMovements).values({ productId, deltaOnHand: 0, deltaReserved: units, reason: "reservation", orderId: order!.id, actor: "system" });
    }

    await addStoreOrderEvent(tx, order!.id, "ORDER_CREATED", "api", { metadata: { units: lines.reduce((sum, line) => sum + line.quantity, 0), totalAmount: order!.totalAmount } });
    await addStoreOrderEvent(tx, order!.id, "INVENTORY_RESERVED", "api", { metadata: { lines, pieces: Object.fromEntries(pieces) } });
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

export async function findStoreOrderByPaymentIntent(db: Executor, paymentIntentId: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.stripePaymentIntentId, paymentIntentId)).limit(1);
  return row ?? null;
}

export async function findStoreOrderByIdempotencyKey(db: Executor, key: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.idempotencyKey, key)).limit(1);
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

/** Pedidos vencidos que libera, como máximo, la ruta caliente del checkout. */
export const STORE_CHECKOUT_RELEASE_LIMIT = 10;

const holdCutoff = (now: Date) => new Date(now.getTime() - STORE_HOLD_GRACE_MINUTES * 60_000);

/**
 * Pedido pendiente cuyo apartado venció (sesión vencida más la gracia, o 5 minutos sin sesión). Los marcados como
 * excepción (p. ej. Stripe cobró otro monto) conservan su apartado hasta que una persona los resuelva.
 */
function expiredHoldWhere(cutoff: Date) {
  return and(
    eq(storeOrders.paymentStatus, "pending"),
    eq(storeOrders.inventoryReserved, true),
    ne(storeOrders.fulfillmentStatus, "exception"),
    or(lt(storeOrders.checkoutExpiresAt, cutoff), and(isNull(storeOrders.checkoutExpiresAt), lt(storeOrders.createdAt, cutoff))),
  );
}

/**
 * Piezas apartadas por pedidos ya vencidos que aún no se liberan, por inventario (id del producto que lo lleva). Solo lee: catálogo y carrito suman
 * esto a `existencias − apartado` en vez de liberar en cada consulta.
 */
export async function getExpiredHeldUnits(db: Executor, productIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  // Por inventario: las piezas de un paquete se cuentan en su producto base.
  const stockKey = sql<string>`coalesce(${storeOrderItems.stockProductId}, ${storeOrderItems.productId})`;
  const rows = await db
    .select({ productId: stockKey, units: sql<number>`sum(${storeOrderItems.quantity} * ${storeOrderItems.stockUnits})::int` })
    .from(storeOrderItems)
    .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.orderId))
    .where(and(inArray(stockKey, productIds), expiredHoldWhere(holdCutoff(now))))
    .groupBy(stockKey);
  return new Map(rows.map((row) => [row.productId, Number(row.units)]));
}

/**
 * Piezas físicas (un paquete de 6 cuenta 6) que un comprador (por correo o por hash de IP) tiene apartadas en pedidos pendientes cuyo apartado sigue vigente
 * (misma regla de vencimiento que la liberación; los marcados como excepción conservan su apartado y cuentan). Solo lee.
 */
export async function getStoreHeldUnits(db: Executor, buyer: { email: string } | { clientIpHash: string }, now: Date = new Date()): Promise<number> {
  const cutoff = holdCutoff(now);
  const who = "email" in buyer ? eq(storeOrders.email, buyer.email.trim().toLowerCase()) : eq(storeOrders.clientIpHash, buyer.clientIpHash);
  const [row] = await db
    .select({ units: sql<number>`coalesce(sum(${storeOrderItems.quantity} * ${storeOrderItems.stockUnits}), 0)::int` })
    .from(storeOrderItems)
    .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.orderId))
    .where(
      and(
        who,
        eq(storeOrders.paymentStatus, "pending"),
        eq(storeOrders.inventoryReserved, true),
        // Negación explícita de expiredHoldWhere sin NULL: coalesce(vence la sesión, creado) >= corte.
        or(eq(storeOrders.fulfillmentStatus, "exception"), gte(sql`coalesce(${storeOrders.checkoutExpiresAt}, ${storeOrders.createdAt})`, cutoff)),
      ),
    );
  return Number(row?.units ?? 0);
}

/**
 * Bloquea en el orden único del módulo: primero el inventario de los productos del pedido (por id) y después la fila del
 * pedido. Las líneas de un pedido no cambian después de crearse, así que leerlas sin bloqueo es seguro.
 */
async function lockOrderAndInventory(
  tx: StoreTx,
  orderId: string,
): Promise<{ order: StoreOrder; items: StoreOrderItem[]; pieces: Map<string, number>; inventory: Map<string, StoreInventory> } | null> {
  const items = await tx.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, orderId));
  // Las líneas guardan de qué inventario descuentan y cuántas piezas por unidad (copia al comprar).
  const pieces = stockUnitsByKey(items);
  const stockIds = [...pieces.keys()];
  const rows = stockIds.length ? await tx.select().from(storeInventory).where(inArray(storeInventory.productId, stockIds)).orderBy(asc(storeInventory.productId)).for("update") : [];
  const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
  if (!order) return null;
  return { order, items, pieces, inventory: new Map(rows.map((row) => [row.productId, row])) };
}

/** Libera las piezas apartadas de un pedido. Solo dentro de una transacción que ya bloqueó inventario y pedido. */
async function releaseReservedStock(tx: StoreTx, order: StoreOrder, pieces: Map<string, number>, source: EventSource): Promise<void> {
  for (const [productId, units] of pieces) {
    await tx
      .update(storeInventory)
      .set({ reserved: sql`${storeInventory.reserved} - ${units}` })
      .where(eq(storeInventory.productId, productId));
    await tx.insert(storeStockMovements).values({ productId, deltaOnHand: 0, deltaReserved: -units, reason: "release", orderId: order.id, actor: "system" });
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
    const { order, pieces, inventory } = locked;
    if (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded" || order.paymentStatus === "refunded") return { order, outcome: "already_paid" as const };

    let outcome: StorePaidOutcome = "paid";
    let fulfillmentStatus = order.fulfillmentStatus;
    if (order.inventoryReserved) {
      for (const [productId, units] of pieces) {
        await tx
          .update(storeInventory)
          .set({ onHand: sql`${storeInventory.onHand} - ${units}`, reserved: sql`${storeInventory.reserved} - ${units}` })
          .where(eq(storeInventory.productId, productId));
        await tx.insert(storeStockMovements).values({ productId, deltaOnHand: -units, deltaReserved: -units, reason: "sale", orderId: order.id, actor: "system" });
      }
    } else if ([...pieces].every(([productId, units]) => {
      const row = inventory.get(productId);
      return !!row && row.onHand - row.reserved >= units;
    })) {
      for (const [productId, units] of pieces) {
        await tx
          .update(storeInventory)
          .set({ onHand: sql`${storeInventory.onHand} - ${units}` })
          .where(eq(storeInventory.productId, productId));
        await tx.insert(storeStockMovements).values({ productId, deltaOnHand: -units, deltaReserved: 0, reason: "sale", orderId: order.id, actor: "system" });
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
  // Pre-chequeo sin bloqueo: un pedido que ya no está pendiente no toma candados de inventario.
  const current = await findStoreOrderById(db, orderId);
  if (!current) return null;
  if (current.paymentStatus !== "pending" || current.fulfillmentStatus === "exception") return { order: current, changed: false };
  return db.transaction(async (tx) => {
    const locked = await lockOrderAndInventory(tx, orderId);
    if (!locked) return null;
    const { order, pieces } = locked;
    // Un pedido marcado como excepción (cobro distinto, dinero retenido) queda congelado para revisión manual: ningún camino automático lo cierra.
    if (order.paymentStatus !== "pending" || order.fulfillmentStatus === "exception") return { order, changed: false };
    // Con el cierre por vencimiento, revalida bajo candado.
    const stillExpired =
      !close.onlyIfHoldExpiredBefore || ((order.checkoutExpiresAt ?? order.createdAt) < close.onlyIfHoldExpiredBefore && order.inventoryReserved);
    if (!stillExpired) return { order, changed: false };
    await tx.update(storeOrders).set({ paymentStatus: close.paymentStatus }).where(eq(storeOrders.id, orderId));
    await addStoreOrderEvent(tx, orderId, close.event, close.source, { metadata: close.metadata });
    if (order.inventoryReserved) await releaseReservedStock(tx, order, pieces, close.source);
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

/** Stripe venció la sesión sin pago: el pedido queda cancelado y se libera el apartado (una sola vez). */
export function markStoreCheckoutExpired(db: Database, orderId: string, ctx: { source: EventSource }) {
  return closePendingOrder(db, orderId, { paymentStatus: "cancelled", event: "CHECKOUT_EXPIRED", source: ctx.source });
}

/**
 * Stripe informa un pago con monto o moneda distintos al pedido. No se marca pagado: queda pendiente como excepción, con
 * su apartado (la liberación automática ignora excepciones) y el payment intent guardado, para que una persona lo revise.
 * Idempotente. `changed` = el pedido pendiente quedó marcado ahora; `recorded` = se escribió un evento EXCEPTION nuevo
 * (un cobro distinto que no se conocía, aunque el pedido ya no estuviera pendiente). Quien llama avisa al equipo solo
 * cuando alguno de los dos es true.
 */
export async function markStoreOrderPaymentMismatch(
  db: Database,
  orderId: string,
  details: { paymentIntentId: string | null; expected: { amount: number; currency: string }; received: { amount: number | null; currency: string | null } },
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<{ order: StoreOrder; changed: boolean; recorded: boolean } | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
    if (!order) return null;
    const metadata = { reason: "amount_mismatch", paymentIntentId: details.paymentIntentId, expected: details.expected, received: details.received };
    if (order.paymentStatus !== "pending" || order.fulfillmentStatus === "exception") {
      // Sin cambiar estado, el cobro distinto queda registrado una sola vez: mismo payment intent (otro evento del mismo
      // cobro) o mismo evento de Stripe ya conocidos no se vuelven a registrar.
      const ref = ctx.externalRef ?? null;
      const pi = details.paymentIntentId;
      const known = await tx
        .select({ metadata: storeOrderEvents.metadata, externalRef: storeOrderEvents.externalRef })
        .from(storeOrderEvents)
        .where(and(eq(storeOrderEvents.orderId, orderId), eq(storeOrderEvents.type, "EXCEPTION")));
      const duplicate = known.some((event) => {
        const meta = (event.metadata ?? {}) as Record<string, unknown>;
        if (meta.reason !== "amount_mismatch") return false;
        if (pi !== null && meta.paymentIntentId === pi) return true;
        if (ref !== null && event.externalRef === ref) return true;
        return pi === null && ref === null && meta.paymentIntentId == null;
      });
      if (duplicate) return { order, changed: false, recorded: false };
      await addStoreOrderEvent(tx, orderId, "EXCEPTION", ctx.source, { externalRef: ref, metadata });
      return { order, changed: false, recorded: true };
    }
    const [updated] = await tx
      .update(storeOrders)
      .set({ fulfillmentStatus: "exception", stripePaymentIntentId: details.paymentIntentId ?? order.stripePaymentIntentId })
      .where(eq(storeOrders.id, orderId))
      .returning();
    await addStoreOrderEvent(tx, orderId, "EXCEPTION", ctx.source, {
      externalRef: ctx.externalRef ?? null,
      metadata,
    });
    return { order: updated!, changed: true, recorded: true };
  });
}

/**
 * Reembolso informado por Stripe (`amountRefunded` es el acumulado; nunca baja). Solo pedidos pagados. Devolver piezas
 * al inventario depende de si el pedido ya salió y se decide en el panel (PR B).
 */
export async function applyStoreRefund(
  db: Database,
  orderId: string,
  amountRefunded: number,
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<{ order: StoreOrder; changed: boolean } | null> {
  if (!Number.isInteger(amountRefunded) || amountRefunded < 0) throw new Error("amountRefunded debe ser un entero no negativo (centavos).");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
    if (!order) return null;
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") return { order, changed: false };
    const amount = Math.min(Math.max(amountRefunded, order.amountRefunded), order.totalAmount);
    if (amount <= order.amountRefunded) return { order, changed: false };
    const full = amount >= order.totalAmount;
    const [updated] = await tx
      .update(storeOrders)
      .set({ paymentStatus: full ? "refunded" : "partially_refunded", amountRefunded: amount })
      .where(eq(storeOrders.id, orderId))
      .returning();
    await addStoreOrderEvent(tx, orderId, full ? "REFUNDED" : "PARTIALLY_REFUNDED", ctx.source, { externalRef: ctx.externalRef ?? null, metadata: { amountRefunded: amount } });
    return { order: updated!, changed: true };
  });
}

// ---------- Correo de confirmación y reconciliación ----------

/** Reserva el correo de pedido pagado; solo una llamada gana aunque lleguen webhook y confirmación en paralelo. */
export async function claimStoreConfirmationEmail(db: Executor, orderId: string): Promise<StoreOrder | null> {
  const [row] = await db
    .update(storeOrders)
    .set({ confirmationEmailSentAt: new Date() })
    .where(and(eq(storeOrders.id, orderId), eq(storeOrders.paymentStatus, "paid"), isNull(storeOrders.confirmationEmailSentAt)))
    .returning();
  return row ?? null;
}

export async function releaseStoreConfirmationEmail(db: Executor, orderId: string): Promise<void> {
  await db.update(storeOrders).set({ confirmationEmailSentAt: null }).where(eq(storeOrders.id, orderId));
}

export async function listStorePaidWithoutConfirmation(db: Executor): Promise<StoreOrder[]> {
  return db
    .select()
    .from(storeOrders)
    .where(and(eq(storeOrders.paymentStatus, "paid"), isNull(storeOrders.confirmationEmailSentAt)))
    .orderBy(asc(storeOrders.paidAt), asc(storeOrders.id));
}

/** Pedidos pendientes con sesión de Stripe creados antes de `olderThan` (red de seguridad si un webhook no llegó). */
export async function listUnsettledStoreOrders(db: Executor, olderThan: Date): Promise<StoreOrder[]> {
  return db
    .select()
    .from(storeOrders)
    .where(and(eq(storeOrders.paymentStatus, "pending"), ne(storeOrders.fulfillmentStatus, "exception"), sql`${storeOrders.stripeCheckoutSessionId} is not null`, lt(storeOrders.createdAt, olderThan)))
    .orderBy(asc(storeOrders.createdAt), asc(storeOrders.id));
}

/**
 * Libera los pedidos pendientes cuyo apartado venció, del que venció antes al más reciente, hasta `limit` (100 por
 * defecto; la ruta caliente del checkout usa STORE_CHECKOUT_RELEASE_LIMIT). Un pedido que falla se registra y no detiene
 * a los demás. Leer disponibilidad NO debe llamarla: usar `getExpiredHeldUnits`.
 */
export async function releaseExpiredStoreOrders(db: Database, now: Date = new Date(), options: { limit?: number; source?: EventSource } = {}): Promise<number> {
  const cutoff = holdCutoff(now);
  const expired = await db
    .select({ id: storeOrders.id })
    .from(storeOrders)
    .where(expiredHoldWhere(cutoff))
    .orderBy(asc(sql`coalesce(${storeOrders.checkoutExpiresAt}, ${storeOrders.createdAt})`), asc(storeOrders.id))
    .limit(options.limit ?? 100);
  let released = 0;
  for (const { id } of expired) {
    try {
      const result = await closePendingOrder(db, id, { paymentStatus: "cancelled", event: "CHECKOUT_EXPIRED", source: options.source ?? "api", onlyIfHoldExpiredBefore: cutoff });
      if (result?.changed) released++;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", msg: "store_release_failed", orderId: id, error: String(error).slice(0, 300) }));
    }
  }
  return released;
}

// ---------- Configuración de entrega y cotizaciones de envío ----------

export type StoreSettings = typeof storeSettings.$inferSelect;
export type StoreSettingsInput = Pick<typeof storeSettings.$inferInsert, "pickupEnabled" | "pickupPoints" | "shippingEnabled" | "shippingProfile">;

const SETTINGS_ID = "default";

export async function getStoreSettings(db: Executor): Promise<StoreSettings | null> {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, SETTINGS_ID)).limit(1);
  return row ?? null;
}

/** Crea la configuración si no existe; con `overwrite` la reemplaza (lo usará el panel). Devuelve la vigente. */
export async function saveStoreSettings(db: Executor, input: StoreSettingsInput, options: { overwrite?: boolean } = {}): Promise<StoreSettings> {
  const insert = db.insert(storeSettings).values({ id: SETTINGS_ID, ...input });
  const [row] = options.overwrite
    ? await insert.onConflictDoUpdate({ target: storeSettings.id, set: { ...input, updatedAt: new Date() } }).returning()
    : await insert.onConflictDoNothing().returning();
  return row ?? (await getStoreSettings(db))!;
}

/**
 * Teléfono del remitente que va en las guías: lo cambia en la configuración de la tienda y en cada preventa con envío
 * configurado (sus guías se siguen generando desde el panel). No toca nada más del perfil. Devuelve lo que cambió.
 */
export async function setShippingOriginPhone(db: Database, phone: string): Promise<{ target: string; before: string }[]> {
  return db.transaction(async (tx) => {
    const changed: { target: string; before: string }[] = [];
    const settings = await getStoreSettings(tx);
    const storeProfile = settings?.shippingProfile;
    if (storeProfile && storeProfile.origin.phone !== phone) {
      await tx
        .update(storeSettings)
        .set({ shippingProfile: { ...storeProfile, origin: { ...storeProfile.origin, phone } }, updatedAt: new Date() })
        .where(eq(storeSettings.id, SETTINGS_ID));
      changed.push({ target: "store", before: storeProfile.origin.phone });
    }
    for (const campaign of await tx.select().from(presaleCampaigns).orderBy(asc(presaleCampaigns.slug))) {
      const profile = campaign.shippingProfile;
      if (!profile || profile.origin.phone === phone) continue;
      await tx
        .update(presaleCampaigns)
        .set({ shippingProfile: { ...profile, origin: { ...profile.origin, phone } }, updatedAt: new Date() })
        .where(eq(presaleCampaigns.id, campaign.id));
      changed.push({ target: `presale:${campaign.slug}`, before: profile.origin.phone });
    }
    return changed;
  });
}

export type StoreShippingQuote = typeof storeShippingQuotes.$inferSelect;

export async function saveStoreShippingQuote(db: Executor, input: typeof storeShippingQuotes.$inferInsert): Promise<StoreShippingQuote> {
  const [row] = await db.insert(storeShippingQuotes).values(input).returning();
  return row!;
}

export async function getStoreShippingQuote(db: Executor, id: string): Promise<StoreShippingQuote | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db.select().from(storeShippingQuotes).where(eq(storeShippingQuotes.id, id)).limit(1);
  return row ?? null;
}
