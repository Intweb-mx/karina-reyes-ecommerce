/*
 * Panel de la tienda: consultas y cambios de estado que hace el equipo (pedidos, entrega, cancelación, productos,
 * resumen). Mismas reglas que store.ts: el historial solo se agrega, el inventario solo cambia con un movimiento y cada
 * transición revisa el estado actual en la base (dos clics o un aviso repetido no la aplican dos veces).
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "./client.ts";
import type { EventSource, Executor, ShipmentDetails } from "./presale.ts";
import { storeInventory, storeOrderEvents, storeOrderItems, storeOrders, storeProducts, storeStockMovements, type StoreOrderEventType } from "./schema/store.ts";
import { addStoreOrderEvent, currentPrice, lockOrderAndInventory, releaseReservedStock, type StoreOrder, type StoreProduct } from "./store.ts";

type FulfillmentStatus = StoreOrder["fulfillmentStatus"];
type DeliveryMethod = StoreOrder["deliveryMethod"];

/** Pago vigente: el pedido se prepara y se entrega. */
export const STORE_PAID_STATUSES = ["paid", "partially_refunded"] as const;
/** El paquete todavía no sale: se puede generar guía, avisar o cancelar devolviendo las piezas. */
export const STORE_NOT_SHIPPED_STATUSES = ["confirmed", "preparing", "label_generated"] as const;
/** Ya salió con la paquetería. */
export const STORE_SHIPPED_STATUSES = ["handed_to_carrier", "in_transit", "out_for_delivery"] as const;

const isPaid = (order: Pick<StoreOrder, "paymentStatus">) => (STORE_PAID_STATUSES as readonly string[]).includes(order.paymentStatus);

// ---------- Lista de pedidos ----------

export type StoreOrderFilter = "all" | "to_ship" | "to_pickup" | "in_transit" | "delivered" | "exception" | "unpaid";
export const STORE_ORDER_FILTERS: readonly StoreOrderFilter[] = ["all", "to_ship", "to_pickup", "in_transit", "delivered", "exception", "unpaid"];

const paidWhere = inArray(storeOrders.paymentStatus, [...STORE_PAID_STATUSES]);

/** Condición de cada filtro. Siempre revisa primero el pago: `fulfillmentStatus` vale "confirmed" aunque no esté pagado. */
function filterWhere(filter: StoreOrderFilter): SQL | undefined {
  switch (filter) {
    case "to_ship":
      return and(paidWhere, eq(storeOrders.deliveryMethod, "shipping"), inArray(storeOrders.fulfillmentStatus, [...STORE_NOT_SHIPPED_STATUSES]));
    case "to_pickup":
      return and(paidWhere, eq(storeOrders.deliveryMethod, "pickup"), inArray(storeOrders.fulfillmentStatus, ["confirmed", "preparing"]));
    case "in_transit":
      return and(paidWhere, inArray(storeOrders.fulfillmentStatus, ["ready_for_pickup", ...STORE_SHIPPED_STATUSES]));
    case "delivered":
      return and(paidWhere, eq(storeOrders.fulfillmentStatus, "delivered"));
    case "exception":
      return and(inArray(storeOrders.paymentStatus, ["pending", ...STORE_PAID_STATUSES]), eq(storeOrders.fulfillmentStatus, "exception"));
    case "unpaid":
      return inArray(storeOrders.paymentStatus, ["pending", "authorized", "failed", "cancelled"]);
    case "all":
      return undefined;
  }
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function searchWhere(search: string | undefined): SQL | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${escapeLike(term)}%`;
  return or(ilike(storeOrders.orderNumber, pattern), ilike(storeOrders.fullName, pattern), ilike(storeOrders.email, pattern), ilike(storeOrders.trackingNumber, pattern));
}

/** Espera acción del equipo: pagado y sin enviar, sin avisar o con incidencia. */
const WAITING = sql<boolean>`(${storeOrders.paymentStatus} in ('paid', 'partially_refunded') and ${storeOrders.fulfillmentStatus} in ('confirmed', 'preparing', 'label_generated', 'exception') and ${storeOrders.deliveryMethod} <> 'digital')`;

export type StoreOrderRow = StoreOrder & { units: number; waiting: boolean };

/**
 * Pedidos de la tienda para el panel. Primero lo que espera acción (del pago más antiguo al más reciente) y después el
 * resto, del más reciente al más antiguo. `counts` respeta la búsqueda, para que cada pestaña diga cuántos hay.
 */
export async function searchStoreOrders(
  db: Executor,
  query: { filter: StoreOrderFilter; search?: string; page?: number; pageSize?: number },
): Promise<{ rows: StoreOrderRow[]; total: number; pageSize: number; counts: Record<StoreOrderFilter, number> }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 5000);
  const page = Math.max(query.page ?? 1, 1);
  const search = searchWhere(query.search);
  // Nombres escritos a mano: en una consulta de una sola tabla Drizzle no califica las columnas y `id` sería ambiguo.
  const units = sql<number>`(select coalesce(sum(i.quantity), 0)::int from store_order_items i where i.order_id = store_orders.id)`;

  const rows = await db
    .select({ order: storeOrders, units, waiting: WAITING })
    .from(storeOrders)
    .where(and(filterWhere(query.filter), search))
    .orderBy(
      sql`case when ${WAITING} then 0 else 1 end`,
      sql`case when ${WAITING} then coalesce(${storeOrders.paidAt}, ${storeOrders.createdAt}) end asc nulls last`,
      desc(storeOrders.createdAt),
      asc(storeOrders.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const count = (filter: StoreOrderFilter) => {
    const where = filterWhere(filter);
    return where ? sql<number>`(count(*) filter (where ${where}))::int` : sql<number>`count(*)::int`;
  };
  const [counts] = await db
    .select({ all: count("all"), to_ship: count("to_ship"), to_pickup: count("to_pickup"), in_transit: count("in_transit"), delivered: count("delivered"), exception: count("exception"), unpaid: count("unpaid") })
    .from(storeOrders)
    .where(search);
  const safe = Object.fromEntries(STORE_ORDER_FILTERS.map((filter) => [filter, Number(counts?.[filter] ?? 0)])) as Record<StoreOrderFilter, number>;

  return { rows: rows.map((row) => ({ ...row.order, units: Number(row.units), waiting: !!row.waiting })), total: safe[query.filter], pageSize, counts: safe };
}

// ---------- Entrega ----------

export type StoreFulfillmentContext = { source: EventSource; actor?: string | null; externalRef?: string | null };

/** Cambio de estado de entrega de un pedido con pago vigente; null si el pedido no está en un estado de partida. */
async function fulfillmentStep(
  db: Database,
  orderId: string,
  guard: { methods: DeliveryMethod[]; from: FulfillmentStatus[]; extra?: SQL },
  set: Partial<typeof storeOrders.$inferInsert>,
  event: StoreOrderEventType,
  ctx: StoreFulfillmentContext,
  metadata: Record<string, unknown> = {},
): Promise<StoreOrder | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(storeOrders)
      .set(set)
      .where(and(eq(storeOrders.id, orderId), paidWhere, inArray(storeOrders.deliveryMethod, guard.methods), inArray(storeOrders.fulfillmentStatus, guard.from), guard.extra))
      .returning();
    if (row) await addStoreOrderEvent(tx, orderId, event, ctx.source, { actor: ctx.actor ?? null, externalRef: ctx.externalRef ?? null, metadata });
    return row ?? null;
  });
}

/** Guarda el envío recién comprado en la paquetería (la guía puede llegar después). Deja SHIPMENT_CREATED una sola vez. */
export async function saveStoreShipment(db: Database, orderId: string, shipment: { shipmentId: string; labelUrl: string | null }, ctx: StoreFulfillmentContext): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(storeOrders)
      .set({ shipmentId: shipment.shipmentId, ...(shipment.labelUrl ? { labelUrl: shipment.labelUrl } : {}) })
      .where(and(eq(storeOrders.id, orderId), isNull(storeOrders.shipmentId)))
      .returning({ id: storeOrders.id });
    if (row) await addStoreOrderEvent(tx, orderId, "SHIPMENT_CREATED", ctx.source, { actor: ctx.actor ?? null, externalRef: shipment.shipmentId });
    else if (shipment.labelUrl) await tx.update(storeOrders).set({ labelUrl: shipment.labelUrl }).where(eq(storeOrders.id, orderId));
  });
}

/** La guía ya tiene número: el pedido queda "guía lista" (todavía no sale; el cliente aún no recibe nada). */
export function markStoreLabelGenerated(
  db: Database,
  orderId: string,
  label: { shipmentId: string; labelUrl: string | null; carrier: string; trackingNumber: string; trackingUrl?: string | null },
  ctx: StoreFulfillmentContext,
) {
  return fulfillmentStep(
    db,
    orderId,
    { methods: ["shipping"], from: ["confirmed", "preparing"] },
    { fulfillmentStatus: "label_generated", shipmentId: label.shipmentId, labelUrl: label.labelUrl, carrier: label.carrier, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl ?? null },
    "LABEL_GENERATED",
    ctx,
    { trackingNumber: label.trackingNumber, carrier: label.carrier },
  );
}

/** Recolección: el pedido está listo y se avisa al cliente. */
export function markStoreReadyForPickup(db: Database, orderId: string, ctx: StoreFulfillmentContext, now: Date = new Date()) {
  return fulfillmentStep(db, orderId, { methods: ["pickup"], from: ["confirmed", "preparing"] }, { fulfillmentStatus: "ready_for_pickup", fulfilledAt: now }, "READY_FOR_PICKUP", ctx);
}

/**
 * Envío: el paquete se entregó a la paquetería. Usa la guía ya guardada o, si la guía se hizo por fuera del panel, la que
 * se pasa en `shipment`. Sin número de guía no avanza.
 */
export function markStoreHandedToCarrier(db: Database, orderId: string, shipment: ShipmentDetails | null, ctx: StoreFulfillmentContext, now: Date = new Date()) {
  return fulfillmentStep(
    db,
    orderId,
    { methods: ["shipping"], from: [...STORE_NOT_SHIPPED_STATUSES], extra: shipment ? undefined : sql`${storeOrders.trackingNumber} is not null` },
    { fulfillmentStatus: "handed_to_carrier", fulfilledAt: now, ...(shipment ? { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl } : {}) },
    "HANDED_TO_CARRIER",
    ctx,
    shipment ? { manual: true, trackingNumber: shipment.trackingNumber } : {},
  );
}

/** Aviso de la paquetería: en tránsito o en reparto. Solo avanza, nunca regresa. */
export function markStoreInTransit(db: Database, orderId: string, status: "in_transit" | "out_for_delivery", ctx: StoreFulfillmentContext) {
  return fulfillmentStep(
    db,
    orderId,
    { methods: ["shipping"], from: status === "in_transit" ? ["handed_to_carrier"] : ["handed_to_carrier", "in_transit"] },
    { fulfillmentStatus: status },
    status === "in_transit" ? "IN_TRANSIT" : "OUT_FOR_DELIVERY",
    ctx,
  );
}

/** Entregado: un envío que ya salió o una recolección ya avisada. */
export async function markStoreDelivered(db: Database, orderId: string, ctx: StoreFulfillmentContext, now: Date = new Date()): Promise<StoreOrder | null> {
  const set = { fulfillmentStatus: "delivered" as const, deliveredAt: now };
  return (
    (await fulfillmentStep(db, orderId, { methods: ["shipping"], from: [...STORE_SHIPPED_STATUSES] }, set, "DELIVERED", ctx)) ??
    (await fulfillmentStep(db, orderId, { methods: ["pickup"], from: ["ready_for_pickup"] }, set, "DELIVERED", ctx))
  );
}

/** Enlace de rastreo de la paquetería, solo si el pedido aún no tiene uno. */
export async function saveStoreTrackingUrlIfMissing(db: Executor, orderId: string, trackingUrl: string): Promise<void> {
  await db.update(storeOrders).set({ trackingUrl }).where(and(eq(storeOrders.id, orderId), isNull(storeOrders.trackingUrl)));
}

export async function findStoreOrderByShipment(db: Executor, ref: { shipmentId?: string | null; trackingNumber?: string | null }): Promise<StoreOrder | null> {
  const conditions = [ref.shipmentId ? eq(storeOrders.shipmentId, ref.shipmentId) : undefined, ref.trackingNumber ? eq(storeOrders.trackingNumber, ref.trackingNumber) : undefined].filter((c) => c !== undefined);
  if (!conditions.length) return null;
  const [row] = await db.select().from(storeOrders).where(or(...conditions)).limit(1);
  return row ?? null;
}

// ---------- Incidencias ----------

/** Última incidencia registrada del pedido (motivo y, si la reportó el equipo, el estado en el que estaba). */
export async function getStoreOrderException(db: Executor, orderId: string): Promise<{ reason: string | null; previousStatus: FulfillmentStatus | null } | null> {
  const [event] = await db
    .select({ metadata: storeOrderEvents.metadata })
    .from(storeOrderEvents)
    .where(and(eq(storeOrderEvents.orderId, orderId), eq(storeOrderEvents.type, "EXCEPTION")))
    .orderBy(desc(storeOrderEvents.seq))
    .limit(1);
  if (!event) return null;
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  return { reason: typeof metadata.reason === "string" ? metadata.reason : null, previousStatus: typeof metadata.previousStatus === "string" ? (metadata.previousStatus as FulfillmentStatus) : null };
}

/** El equipo reporta un problema (paquete detenido, dirección incorrecta, daño…). Guarda el estado para poder retomarlo. */
export async function reportStoreException(db: Database, orderId: string, note: string | null, ctx: StoreFulfillmentContext): Promise<StoreOrder | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
    if (!order || !isPaid(order) || order.fulfillmentStatus === "exception" || order.fulfillmentStatus === "delivered") return null;
    const [updated] = await tx.update(storeOrders).set({ fulfillmentStatus: "exception" }).where(eq(storeOrders.id, orderId)).returning();
    await addStoreOrderEvent(tx, orderId, "EXCEPTION", ctx.source, { actor: ctx.actor ?? null, metadata: { reason: "reported", previousStatus: order.fulfillmentStatus, note } });
    return updated!;
  });
}

/** La incidencia reportada por el equipo se resolvió: el pedido vuelve al estado que tenía. Las demás se resuelven cancelando. */
export async function resolveStoreException(db: Database, orderId: string, note: string | null, ctx: StoreFulfillmentContext): Promise<StoreOrder | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
    if (!order || !isPaid(order) || order.fulfillmentStatus !== "exception") return null;
    const exception = await getStoreOrderException(tx, orderId);
    if (exception?.reason !== "reported" || !exception.previousStatus) return null;
    const [updated] = await tx.update(storeOrders).set({ fulfillmentStatus: exception.previousStatus }).where(eq(storeOrders.id, orderId)).returning();
    await addStoreOrderEvent(tx, orderId, "EXCEPTION_RESOLVED", ctx.source, { actor: ctx.actor ?? null, metadata: { restoredStatus: exception.previousStatus, note } });
    return updated!;
  });
}

// ---------- Cancelación ----------

export type StoreCancelResult = { order: StoreOrder; changed: boolean; restocked: boolean } | { error: "not_found" | "paid" | "shipped" | "closed" };

/**
 * Cancela un pedido (una sola vez; el evento CANCELLED es la marca).
 * - Sin pagar: queda cancelado y se libera lo apartado.
 * - Reembolsado por completo y sin haber salido: las piezas vendidas vuelven al inventario con un movimiento de devolución.
 * Un pedido con pago vigente no se cancela aquí: primero se reembolsa (quien llama lo hace en Stripe y registra el
 * reembolso con `applyStoreRefund`). Un pedido que ya salió con la paquetería tampoco: la devolución se atiende aparte.
 */
export async function cancelStoreOrder(db: Database, orderId: string, ctx: { source: EventSource; actor?: string | null; note?: string | null }): Promise<StoreCancelResult> {
  return db.transaction(async (tx): Promise<StoreCancelResult> => {
    const locked = await lockOrderAndInventory(tx, orderId);
    if (!locked) return { error: "not_found" };
    const { order, pieces } = locked;
    const [done] = await tx.select({ id: storeOrderEvents.id }).from(storeOrderEvents).where(and(eq(storeOrderEvents.orderId, orderId), eq(storeOrderEvents.type, "CANCELLED"))).limit(1);
    if (done) return { order, changed: false, restocked: false };
    const meta = { note: ctx.note ?? null };

    if (order.paymentStatus === "pending" || order.paymentStatus === "authorized") {
      await tx.update(storeOrders).set({ paymentStatus: "cancelled" }).where(eq(storeOrders.id, orderId));
      await addStoreOrderEvent(tx, orderId, "CANCELLED", ctx.source, { actor: ctx.actor ?? null, metadata: { ...meta, restocked: false } });
      if (order.inventoryReserved) await releaseReservedStock(tx, order, pieces, ctx.source);
      const [updated] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId));
      return { order: updated!, changed: true, restocked: false };
    }
    if (isPaid(order)) return { error: "paid" };
    if (order.paymentStatus !== "refunded") return { error: "closed" };

    const shipped = (status: FulfillmentStatus | null) => !!status && ([...STORE_SHIPPED_STATUSES, "delivered"] as string[]).includes(status);
    const previous = order.fulfillmentStatus === "exception" ? ((await getStoreOrderException(tx, orderId))?.previousStatus ?? null) : order.fulfillmentStatus;
    if (order.deliveryMethod !== "digital" && shipped(previous)) return { error: "shipped" };

    // Solo vuelve al inventario lo que sí se descontó (un pago sin stock nunca descontó) y que no se haya devuelto ya.
    const movements = await tx.select({ reason: storeStockMovements.reason }).from(storeStockMovements).where(eq(storeStockMovements.orderId, orderId));
    const restock = movements.some((m) => m.reason === "sale") && !movements.some((m) => m.reason === "return") && pieces.size > 0;
    if (restock) {
      for (const [productId, units] of pieces) {
        await tx.update(storeInventory).set({ onHand: sql`${storeInventory.onHand} + ${units}` }).where(eq(storeInventory.productId, productId));
        await tx.insert(storeStockMovements).values({ productId, deltaOnHand: units, deltaReserved: 0, reason: "return", orderId, actor: ctx.actor ?? "system", note: "Pedido cancelado" });
      }
    }
    await addStoreOrderEvent(tx, orderId, "CANCELLED", ctx.source, { actor: ctx.actor ?? null, metadata: { ...meta, restocked: restock } });
    return { order, changed: true, restocked: restock };
  });
}

/** El pedido ya fue cancelado desde el panel. */
export async function isStoreOrderCancelled(db: Executor, orderId: string): Promise<boolean> {
  const [row] = await db.select({ id: storeOrderEvents.id }).from(storeOrderEvents).where(and(eq(storeOrderEvents.orderId, orderId), eq(storeOrderEvents.type, "CANCELLED"))).limit(1);
  return !!row;
}

// ---------- Productos ----------

export type StoreProductPatch = { price?: number; published?: boolean; lowStockThreshold?: number; maxQuantityPerOrder?: number };

/**
 * Edición desde el panel. `price` es el precio que se cobra hoy: si el nuevo precio alcanza o supera el precio normal, o
 * el descuento de temporada ya venció, deja de haber precio tachado y fecha de fin. Devuelve antes y después (bitácora).
 */
export async function updateStoreProductSettings(db: Database, productId: string, patch: StoreProductPatch, now: Date = new Date()): Promise<{ before: StoreProduct; after: StoreProduct } | null> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(storeProducts).where(eq(storeProducts.id, productId)).for("update");
    if (!before) return null;
    const set: Partial<typeof storeProducts.$inferInsert> = {};
    if (patch.published !== undefined) set.published = patch.published;
    if (patch.lowStockThreshold !== undefined) set.lowStockThreshold = patch.lowStockThreshold;
    if (patch.maxQuantityPerOrder !== undefined) set.maxQuantityPerOrder = patch.maxQuantityPerOrder;
    if (patch.price !== undefined && patch.price !== currentPrice(before, now).price) {
      const saleOver = !!before.saleEndsAt && now >= before.saleEndsAt;
      set.price = patch.price;
      if (saleOver || (before.compareAtPrice !== null && patch.price >= before.compareAtPrice)) {
        set.compareAtPrice = null;
        set.saleEndsAt = null;
      }
    }
    if (!Object.keys(set).length) return { before, after: before };
    const [after] = await tx.update(storeProducts).set({ ...set, updatedAt: now }).where(eq(storeProducts.id, productId)).returning();
    return { before, after: after! };
  });
}

// ---------- Resumen ----------

export type StoreDashboard = {
  sales: number;
  orders: number;
  currency: string;
  toShip: number;
  toPickup: number;
  exceptions: number;
  lowStock: number;
  topProducts: { name: string; units: number }[];
};

/**
 * Métricas reales del panel. Ventas y pedidos: pagos vigentes recibidos desde `since` (null = siempre), con envío y sin lo
 * reembolsado. Por atender, incidencias y poco inventario son el estado de hoy, sin importar el periodo.
 */
export async function getStoreDashboard(db: Executor, since: Date | null): Promise<StoreDashboard> {
  const inPeriod = and(paidWhere, since ? gte(storeOrders.paidAt, since) : undefined);
  const [sales] = await db
    .select({ amount: sql<number>`coalesce(sum(${storeOrders.totalAmount} - ${storeOrders.amountRefunded}), 0)::int`, orders: sql<number>`count(*)::int`, currency: sql<string | null>`min(${storeOrders.currency})` })
    .from(storeOrders)
    .where(inPeriod);
  const count = (where: SQL | undefined) => sql<number>`(count(*) filter (where ${where}))::int`;
  const [queue] = await db.select({ toShip: count(filterWhere("to_ship")), toPickup: count(filterWhere("to_pickup")), exceptions: count(filterWhere("exception")) }).from(storeOrders);
  const [low] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storeProducts)
    .innerJoin(storeInventory, eq(storeInventory.productId, storeProducts.id))
    .where(and(eq(storeProducts.published, true), eq(storeProducts.type, "physical"), isNull(storeProducts.stockProductId), sql`${storeInventory.onHand} - ${storeInventory.reserved} <= ${storeProducts.lowStockThreshold}`));
  const units = sql<number>`sum(${storeOrderItems.quantity})::int`;
  const top = await db
    .select({ name: storeOrderItems.name, units })
    .from(storeOrderItems)
    .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.orderId))
    .where(inPeriod)
    .groupBy(storeOrderItems.name)
    .orderBy(desc(units), asc(storeOrderItems.name))
    .limit(5);
  return {
    sales: Number(sales?.amount ?? 0),
    orders: Number(sales?.orders ?? 0),
    currency: sales?.currency ?? "mxn",
    toShip: Number(queue?.toShip ?? 0),
    toPickup: Number(queue?.toPickup ?? 0),
    exceptions: Number(queue?.exceptions ?? 0),
    lowStock: Number(low?.count ?? 0),
    topProducts: top.map((row) => ({ name: row.name, units: Number(row.units) })),
  };
}
