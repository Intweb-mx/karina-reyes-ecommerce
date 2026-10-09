import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns.ts";
import type { DeliveryAddress, ShippingSelection } from "./presale.ts";

export const storeProductType = pgEnum("store_product_type", ["physical", "digital"]);

/** Fase comercial del producto. "Agotado" y "poco inventario" se derivan del inventario, no se guardan. */
export const storeSaleStatus = pgEnum("store_sale_status", ["coming_soon", "presale", "on_sale"]);

export const storeStockReason = pgEnum("store_stock_reason", ["reception", "adjustment", "damage", "return", "correction", "sale", "reservation", "release"]);

export const storePaymentStatus = pgEnum("store_payment_status", ["pending", "authorized", "paid", "failed", "cancelled", "refunded", "partially_refunded"]);

export const storeFulfillmentStatus = pgEnum("store_fulfillment_status", [
  "confirmed",
  "preparing",
  "label_generated",
  "ready_for_pickup",
  "handed_to_carrier",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
]);

export const storeDeliveryMethod = pgEnum("store_delivery_method", ["shipping", "pickup"]);

export type StoreOrderEventType =
  | "ORDER_CREATED"
  | "CHECKOUT_CREATED"
  | "CHECKOUT_CREATE_FAILED"
  | "CHECKOUT_EXPIRED"
  | "PAYMENT_APPROVED"
  | "PAYMENT_FAILED"
  | "INVENTORY_RESERVED"
  | "INVENTORY_COMMITTED"
  | "INVENTORY_RELEASED"
  | "SHIPPING_QUOTED"
  | "SHIPMENT_CREATED"
  | "LABEL_GENERATED"
  | "READY_FOR_PICKUP"
  | "HANDED_TO_CARRIER"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CONFIRMATION_EMAIL_SENT"
  | "CONFIRMATION_EMAIL_FAILED"
  | "CANCELLED"
  | "REFUND_REQUESTED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "EXCEPTION";

export const storeProducts = pgTable(
  "store_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    sku: text().unique(),
    name: text().notNull(),
    type: storeProductType().notNull().default("physical"),
    saleStatus: storeSaleStatus().notNull().default("coming_soon"),
    published: boolean().notNull().default(false),
    /** Centavos. Null = precio pendiente: el producto no se puede comprar. */
    price: integer(),
    compareAtPrice: integer(),
    currency: text().notNull().default("mxn"),
    maxQuantityPerOrder: integer().notNull().default(10),
    lowStockThreshold: integer().notNull().default(5),
    /** Logística (SkyDropX). */
    weightGrams: integer(),
    lengthCm: integer(),
    widthCm: integer(),
    heightCm: integer(),
    territories: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("store_products_price_check", sql`${table.price} is null or ${table.price} >= 0`),
    check("store_products_compare_price_check", sql`${table.compareAtPrice} is null or ${table.compareAtPrice} >= 0`),
    check("store_products_max_quantity_check", sql`${table.maxQuantityPerOrder} between 1 and 100`),
    check("store_products_low_stock_check", sql`${table.lowStockThreshold} >= 0`),
  ],
);

/** Existencias y apartado por producto. Disponible = onHand − reserved. */
export const storeInventory = pgTable(
  "store_inventory",
  {
    productId: uuid()
      .primaryKey()
      .references(() => storeProducts.id, { onDelete: "restrict" }),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [check("store_inventory_levels_check", sql`${table.reserved} >= 0 and ${table.onHand} >= ${table.reserved}`)],
);

export const storeOrders = pgTable(
  "store_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Folio público no secuencial (p. ej. INT-7K2M9QX4TB). */
    orderNumber: text().notNull().unique(),
    paymentStatus: storePaymentStatus().notNull().default("pending"),
    /** Ojo: vale "confirmed" incluso sin pagar; todo filtro debe revisar paymentStatus primero. */
    fulfillmentStatus: storeFulfillmentStatus().notNull().default("confirmed"),
    fullName: text().notNull(),
    /** Siempre en minúsculas. */
    email: text().notNull(),
    phone: text(),
    deliveryMethod: storeDeliveryMethod().notNull(),
    pickupPointId: text(),
    deliveryAddress: jsonb().$type<DeliveryAddress>(),
    shippingSelection: jsonb().$type<ShippingSelection>(),
    subtotalAmount: integer().notNull(),
    discountAmount: integer().notNull().default(0),
    shippingAmount: integer().notNull().default(0),
    totalAmount: integer().notNull(),
    currency: text().notNull(),
    termsVersion: integer().notNull(),
    termsAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    marketingConsent: boolean().notNull().default(false),
    /** Clave enviada por el cliente para no duplicar pedidos por doble clic. */
    idempotencyKey: text().unique(),
    stripeCheckoutSessionId: text().unique(),
    stripeCheckoutUrl: text(),
    checkoutExpiresAt: timestamp({ withTimezone: true }),
    stripePaymentIntentId: text().unique(),
    /** True mientras las unidades del pedido están apartadas (sirve para liberarlas una sola vez). */
    inventoryReserved: boolean().notNull().default(false),
    paidAt: timestamp({ withTimezone: true }),
    amountRefunded: integer().notNull().default(0),
    carrier: text(),
    trackingNumber: text(),
    trackingUrl: text(),
    shipmentId: text(),
    labelUrl: text(),
    fulfilledAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    /** Atribución (utm_*, referrer). Sin PII adicional. */
    attribution: jsonb().$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("store_orders_payment_created_idx").on(table.paymentStatus, table.createdAt),
    index("store_orders_email_idx").on(table.email),
    check("store_orders_total_check", sql`${table.totalAmount} = ${table.subtotalAmount} - ${table.discountAmount} + ${table.shippingAmount}`),
    check("store_orders_amounts_check", sql`${table.subtotalAmount} >= 0 and ${table.discountAmount} >= 0 and ${table.discountAmount} <= ${table.subtotalAmount} and ${table.shippingAmount} >= 0`),
    check("store_orders_shipping_check", sql`${table.deliveryMethod} = 'shipping' or ${table.shippingAmount} = 0`),
    check("store_orders_refund_check", sql`${table.amountRefunded} between 0 and ${table.totalAmount}`),
  ],
);

/** Líneas del pedido: nombre, SKU y precio copiados al momento de la compra. */
export const storeOrderItems = pgTable(
  "store_order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => storeOrders.id, { onDelete: "restrict" }),
    productId: uuid()
      .notNull()
      .references(() => storeProducts.id, { onDelete: "restrict" }),
    productSlug: text().notNull(),
    sku: text(),
    name: text().notNull(),
    quantity: integer().notNull(),
    unitAmount: integer().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("store_order_items_order_product_unique").on(table.orderId, table.productId),
    index("store_order_items_product_idx").on(table.productId),
    check("store_order_items_quantity_check", sql`${table.quantity} >= 1`),
    check("store_order_items_amount_check", sql`${table.unitAmount} >= 0`),
  ],
);

/** Libro de movimientos de inventario. Append-only: la suma de los cambios debe igualar las existencias y lo apartado. */
export const storeStockMovements = pgTable(
  "store_stock_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Orden de inserción (ids uuid no ordenan; created_at se repite dentro de una transacción). */
    seq: bigint({ mode: "number" }).generatedAlwaysAsIdentity(),
    productId: uuid()
      .notNull()
      .references(() => storeProducts.id, { onDelete: "restrict" }),
    deltaOnHand: integer().notNull().default(0),
    deltaReserved: integer().notNull().default(0),
    reason: storeStockReason().notNull(),
    orderId: uuid().references(() => storeOrders.id, { onDelete: "restrict" }),
    /** Correo del administrador, o "system" para movimientos automáticos. */
    actor: text(),
    note: text(),
    createdAt: createdAt(),
  },
  (table) => [
    index("store_stock_movements_product_idx").on(table.productId, table.createdAt),
    check("store_stock_movements_delta_check", sql`${table.deltaOnHand} <> 0 or ${table.deltaReserved} <> 0`),
  ],
);

/** Historial del pedido. Append-only. */
export const storeOrderEvents = pgTable(
  "store_order_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Orden de inserción (ids uuid no ordenan; created_at se repite dentro de una transacción). */
    seq: bigint({ mode: "number" }).generatedAlwaysAsIdentity(),
    orderId: uuid()
      .notNull()
      .references(() => storeOrders.id, { onDelete: "restrict" }),
    type: text().$type<StoreOrderEventType>().notNull(),
    /** api | stripe | cli | panel */
    source: text().notNull(),
    actor: text(),
    externalRef: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("store_order_events_order_idx").on(table.orderId, table.createdAt)],
);

/** Notas internas del equipo. Append-only. */
export const storeOrderNotes = pgTable(
  "store_order_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Orden de inserción (ids uuid no ordenan; created_at se repite dentro de una transacción). */
    seq: bigint({ mode: "number" }).generatedAlwaysAsIdentity(),
    orderId: uuid()
      .notNull()
      .references(() => storeOrders.id, { onDelete: "restrict" }),
    body: text().notNull(),
    authorEmail: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("store_order_notes_order_idx").on(table.orderId, table.createdAt),
    check("store_order_notes_body_check", sql`char_length(${table.body}) between 1 and 2000`),
  ],
);
