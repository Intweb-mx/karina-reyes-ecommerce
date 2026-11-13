import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns.ts";
import type { DeliveryAddress, PickupPoint, ShippingProfile, ShippingSelection } from "./presale.ts";

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

/** "digital": pedido solo con productos digitales (sin envío ni recolección; se entrega por enlace de descarga). */
export const storeDeliveryMethod = pgEnum("store_delivery_method", ["shipping", "pickup", "digital"]);

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
  | "DOWNLOAD_LINK_ISSUED"
  | "DOWNLOAD_USED"
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
    /**
     * Paquete: producto propio (precio y SKU) que descuenta `stockUnits` piezas del inventario de `stockProductId`
     * (p. ej. dúo = 2 × UNO+UNO). Null = el producto lleva su propio inventario.
     */
    stockProductId: uuid().references((): AnyPgColumn => storeProducts.id, { onDelete: "restrict" }),
    stockUnits: integer().notNull().default(1),
    /** Envío a domicilio gratis desde esta fecha (null = desde ya) hasta `freeShippingUntil`. */
    freeShippingFrom: timestamp({ withTimezone: true }),
    /** Envío a domicilio gratis hasta esta fecha (promoción de temporada). Null = sin envío gratis. */
    freeShippingUntil: timestamp({ withTimezone: true }),
    /**
     * Fin del descuento de temporada: desde esta fecha se cobra `compareAtPrice` (el precio normal) y ya no se muestra
     * tachado. Null = el precio no vence.
     */
    saleEndsAt: timestamp({ withTimezone: true }),
    /** Producto digital: llave del archivo en el almacenamiento privado (se entrega con un enlace de un solo uso). */
    digitalFileKey: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("store_products_price_check", sql`${table.price} is null or ${table.price} >= 0`),
    check("store_products_stock_units_check", sql`${table.stockUnits} between 1 and 100`),
    check("store_products_bundle_check", sql`${table.stockProductId} is null and ${table.stockUnits} = 1 or ${table.stockProductId} is not null and ${table.stockProductId} <> ${table.id}`),
    check("store_products_compare_price_check", sql`${table.compareAtPrice} is null or ${table.compareAtPrice} >= 0`),
    check("store_products_free_shipping_check", sql`${table.freeShippingFrom} is null or ${table.freeShippingUntil} > ${table.freeShippingFrom}`),
    check("store_products_digital_check", sql`${table.type} = 'physical' and ${table.digitalFileKey} is null or ${table.type} = 'digital' and ${table.stockProductId} is null`),
    check("store_products_sale_ends_check", sql`${table.saleEndsAt} is null or ${table.compareAtPrice} is not null`),
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
    /** Reserva idempotente del correo de pedido pagado (cliente o, si es excepción, solo aviso al equipo). */
    confirmationEmailSentAt: timestamp({ withTimezone: true }),
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
    /** Hash de la IP de quien compró (nunca la IP): límite de piezas apartadas por comprador. */
    clientIpHash: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("store_orders_payment_created_idx").on(table.paymentStatus, table.createdAt),
    index("store_orders_email_idx").on(table.email),
    index("store_orders_client_ip_hash_idx").on(table.clientIpHash),
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
    /** Copia, al comprar, de qué inventario descuenta la línea: null = el del propio producto; piezas por unidad. */
    stockProductId: uuid().references(() => storeProducts.id, { onDelete: "restrict" }),
    stockUnits: integer().notNull().default(1),
    /** Copia, al comprar: producto digital (no aparta ni descuenta inventario; se entrega por enlace de descarga). */
    digital: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    check("store_order_items_stock_units_check", sql`${table.stockUnits} between 1 and 100`),
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

/** Configuración de entrega de la tienda. Una sola fila (`id = 'default'`); la siembra `pnpm store:seed` y la editará el panel. */
export const storeSettings = pgTable(
  "store_settings",
  {
    id: text().primaryKey().default("default"),
    pickupEnabled: boolean().notNull().default(false),
    pickupPoints: jsonb().$type<PickupPoint[]>().notNull().default([]),
    shippingEnabled: boolean().notNull().default(false),
    /** Origen, paquete por unidad (respaldo si el producto no tiene medidas), paqueterías permitidas, carta porte y empaque. */
    shippingProfile: jsonb().$type<ShippingProfile>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check("store_settings_singleton_check", sql`${table.id} = 'default'`)],
);

export type StoreQuoteLine = { productId: string; quantity: number };
export type StoreQuoteOption = { id: string; rateId: string; carrier: string; service: string; days: number | null; amount: number };

/** Cotizaciones de envío por carrito. El costo cobrado sale de aquí, nunca del navegador. */
export const storeShippingQuotes = pgTable(
  "store_shipping_quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Líneas cotizadas (unidas por producto y ordenadas): el checkout debe traer exactamente las mismas. */
    lines: jsonb().$type<StoreQuoteLine[]>().notNull(),
    postalCode: text().notNull(),
    quotationId: text().notNull(),
    currency: text().notNull(),
    options: jsonb().$type<StoreQuoteOption[]>().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("store_shipping_quotes_created_idx").on(table.createdAt)],
);

/**
 * Enlaces de descarga de productos digitales: sirven UNA vez (se gastan al pulsar "Descargar", no al abrir el correo, para
 * que los revisores de enlaces del correo no los consuman). Solo se guarda el hash del token. Reenviar = nuevo enlace y
 * los anteriores sin usar quedan revocados.
 */
export const storeDownloadLinks = pgTable(
  "store_download_links",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => storeOrders.id, { onDelete: "restrict" }),
    productId: uuid()
      .notNull()
      .references(() => storeProducts.id, { onDelete: "restrict" }),
    tokenHash: text().notNull().unique(),
    createdAt: createdAt(),
    usedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("store_download_links_order_idx").on(table.orderId)],
);
