# Tienda — Subproyecto 1: base de datos e inventario · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear las tablas de productos, inventario con movimientos y pedidos de la tienda, con apartado de stock sin sobreventa, y la carga inicial de UNO+UNO sin precio.

**Architecture:** Esquema Drizzle nuevo (`schema/store.ts`) y funciones de consulta en `packages/database/src/store.ts`, sin tocar `presale_*`. El inventario guarda `onHand` y `reserved` y cada cambio escribe un movimiento append-only; las operaciones de pago bloquean primero el inventario (por id) y después el pedido, para evitar bloqueos cruzados.

**Tech Stack:** TypeScript estricto, Drizzle ORM 0.45 + PostgreSQL (Supabase), PGlite en pruebas, Vitest.

**Spec:** [docs/store/subproyecto-1-diseno.md](./subproyecto-1-diseno.md) (leerlo antes de empezar). Contrato del frontend que esto alimenta: `apps/inttimo/src/lib/store/contract.ts` y `admin-contract.ts`.

## Global Constraints

- Rama: `feat/tienda-base-datos` (parte de `feat/panel-por-hacer`; la última migración existente es `0009_order_notes.sql`, la nueva es `0010`).
- **Toda tabla nueva:** RLS activado, sin privilegios para `anon`/`authenticated`. El test `todas las tablas de public tienen RLS activo` (`packages/database/tests/presale.test.ts`) debe seguir pasando.
- **Nunca apuntar migraciones ni scripts al puerto 54322** (Supabase local de otro proyecto). La base local de este repo es `127.0.0.1:55322`.
- **Nunca ejecutar nada contra producción.** `pnpm db:migrate` y `pnpm store:seed` solo contra la base local (`DATABASE_URL` de `.env`).
- **No inventar precios ni datos de negocio:** UNO+UNO se carga sin precio (`price = null`) y como `coming_soon`.
- Montos en **centavos** (enteros). El precio sale siempre de la base, nunca del cliente.
- Historiales **append-only** (movimientos, eventos, notas): trigger que rechaza UPDATE y DELETE.
- Todo cambio de existencias o apartado escribe un movimiento; la suma de movimientos debe igualar `onHand` y `reserved`.
- **Orden de bloqueo único:** primero las filas de `store_inventory` de los productos (ordenadas por `product_id`) y después la fila del pedido. Nunca al revés.
- Mensajes de error visibles en español, en lenguaje de negocio.
- No tocar la preventa: nada de `presale_*`, `server/presale/**` ni rutas `/api/preventa/*`.
- Comandos de verificación (desde la raíz): `pnpm lint`, `pnpm typecheck`, `pnpm test`. Para una sola prueba de base de datos: `pnpm --filter @inttimo/database exec vitest run tests/<archivo>.test.ts`.
- Commits estilo `feat(inttimo): …`, terminados con el trailer `Co-Authored-By` que te hayan indicado.

---

### Task 1: Esquema, migración 0010 y restricciones

**Files:**
- Create: `packages/database/src/schema/store.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/migrations/0010_store_core.sql` (generada, más RLS y triggers) y `packages/database/migrations/meta/*` (generados)
- Test: `packages/database/tests/store-schema.test.ts`

**Interfaces:**
- Produces (exportados desde `@inttimo/database`):
  - Enums: `storeProductType`, `storeSaleStatus`, `storeStockReason`, `storePaymentStatus`, `storeFulfillmentStatus`, `storeDeliveryMethod`
  - Tablas: `storeProducts`, `storeInventory`, `storeStockMovements`, `storeOrders`, `storeOrderItems`, `storeOrderEvents`, `storeOrderNotes`
  - Tipo: `StoreOrderEventType`

- [ ] **Step 1: Write the failing test**

Crear `packages/database/tests/store-schema.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

let counter = 0;

async function product(): Promise<string> {
  counter += 1;
  const result = await db.execute(sql`insert into store_products (slug, name) values (${`producto-${counter}`}, 'Producto') returning id`);
  return rowsOf<{ id: string }>(result)[0]!.id;
}

async function order(overrides: { total?: number; shipping?: number; method?: string; refunded?: number } = {}): Promise<string> {
  counter += 1;
  const { total = 1100, shipping = 100, method = "shipping", refunded = 0 } = overrides;
  const result = await db.execute(sql`
    insert into store_orders (order_number, full_name, email, delivery_method, subtotal_amount, shipping_amount, total_amount, amount_refunded, currency, terms_version, terms_accepted_at)
    values (${`INT-TEST${counter}`}, 'Ana', 'ana@ejemplo.com', ${method}::store_delivery_method, 1000, ${shipping}, ${total}, ${refunded}, 'mxn', 1, now())
    returning id`);
  return rowsOf<{ id: string }>(result)[0]!.id;
}

describe("productos", () => {
  it("nacen ocultos, sin precio y como próximamente", async () => {
    const id = await product();
    const result = await db.execute(sql`select published, price, sale_status, max_quantity_per_order from store_products where id = ${id}`);
    expect(rowsOf(result)[0]).toEqual({ published: false, price: null, sale_status: "coming_soon", max_quantity_per_order: 10 });
  });

  it("rechaza precios negativos y máximos fuera de rango", async () => {
    await expect(db.execute(sql`insert into store_products (slug, name, price) values ('negativo', 'X', -1)`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_products (slug, name, max_quantity_per_order) values ('sin-maximo', 'X', 0)`)).rejects.toThrow();
  });
});

describe("inventario", () => {
  it("las existencias nunca bajan de lo apartado y lo apartado nunca es negativo", async () => {
    const id = await product();
    await expect(db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, 6)`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, -1)`)).rejects.toThrow();
    await db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, 5)`);
    await expect(db.execute(sql`update store_inventory set on_hand = 4 where product_id = ${id}`)).rejects.toThrow();
  });
});

describe("pedidos", () => {
  it("el total tiene que ser subtotal − descuento + envío", async () => {
    await expect(order({ total: 1200 })).rejects.toThrow();
    await expect(order()).resolves.toBeTypeOf("string");
  });

  it("solo los pedidos con envío pueden cobrar envío", async () => {
    await expect(order({ method: "pickup", shipping: 100, total: 1100 })).rejects.toThrow();
    await expect(order({ method: "pickup", shipping: 0, total: 1000 })).resolves.toBeTypeOf("string");
  });

  it("lo reembolsado no puede superar el total", async () => {
    await expect(order({ refunded: 1101 })).rejects.toThrow();
  });
});

describe("historiales", () => {
  it("movimientos, eventos y notas no se editan ni se borran", async () => {
    const productId = await product();
    const orderId = await order();
    await db.execute(sql`insert into store_stock_movements (product_id, delta_on_hand, reason) values (${productId}, 3, 'reception')`);
    await db.execute(sql`insert into store_order_events (order_id, type, source) values (${orderId}, 'ORDER_CREATED', 'api')`);
    await db.execute(sql`insert into store_order_notes (order_id, body, author_email) values (${orderId}, 'Nota', 'karina@ejemplo.com')`);
    for (const table of ["store_stock_movements", "store_order_events", "store_order_notes"]) {
      await expect(db.execute(sql.raw(`update ${table} set created_at = now()`))).rejects.toThrow();
      await expect(db.execute(sql.raw(`delete from ${table}`))).rejects.toThrow();
    }
  });

  it("un movimiento sin cambios y una nota vacía se rechazan", async () => {
    const productId = await product();
    const orderId = await order();
    await expect(db.execute(sql`insert into store_stock_movements (product_id, reason) values (${productId}, 'adjustment')`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_order_notes (order_id, body, author_email) values (${orderId}, '', 'karina@ejemplo.com')`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-schema.test.ts`
Expected: FAIL — `relation "store_products" does not exist`.

- [ ] **Step 3: Crear el esquema**

Crear `packages/database/src/schema/store.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
```

Reemplazar el contenido de `packages/database/src/schema/index.ts` por:

```ts
export * from "./presale.ts";
export * from "./store.ts";
```

- [ ] **Step 4: Generar la migración y añadir RLS y triggers**

Run: `pnpm --filter @inttimo/database db:generate --name store_core`
Expected: crea `packages/database/migrations/0010_store_core.sql` y actualiza `migrations/meta/` (no se conecta a ninguna base).

Añadir **al final** de `0010_store_core.sql`:

```sql
--> statement-breakpoint
-- Tablas nuevas: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "store_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_order_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Historiales append-only.
CREATE FUNCTION "store_stock_movements_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_stock_movements es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_stock_movements_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "store_stock_movements_append_only"();--> statement-breakpoint
CREATE FUNCTION "store_order_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_order_events es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_order_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_order_events"
  FOR EACH ROW EXECUTE FUNCTION "store_order_events_append_only"();--> statement-breakpoint
CREATE FUNCTION "store_order_notes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'store_order_notes es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "store_order_notes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "store_order_notes"
  FOR EACH ROW EXECUTE FUNCTION "store_order_notes_append_only"();
```

Si drizzle-kit nombró el archivo distinto de `0010_store_core.sql`, usar el nombre generado (el journal lo referencia) y mencionarlo en el reporte.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-schema.test.ts`
Expected: PASS (8 tests).

Run: `pnpm --filter @inttimo/database test`
Expected: PASS, incluido `todas las tablas de public tienen RLS activo`.

- [ ] **Step 6: Typecheck y commit**

Run: `pnpm --filter @inttimo/database typecheck`
Expected: sin errores.

```bash
git add packages/database
git commit -m "feat(inttimo): store schema, migration 0010 and constraints

Products, inventory with an append-only ledger, orders, items, events and notes.
RLS on every table, append-only triggers and check constraints for stock levels
and order totals."
```

---

### Task 2: Productos e inventario

**Files:**
- Create: `packages/database/src/store.ts`
- Modify: `packages/database/src/index.ts`
- Test: `packages/database/tests/store-inventory.test.ts`

**Interfaces:**
- Consumes: tablas de la Task 1.
- Produces (exportados desde `@inttimo/database`):
  - Tipos: `StoreProduct`, `NewStoreProduct`, `StoreInventory`, `StoreStockMovement`, `StoreProductWithInventory`, `StockAdjustmentReason`
  - Errores: `StoreProductNotFoundError`, `InvalidStockAdjustmentError`, `StockBelowReservedError` (con `reserved: number`)
  - `upsertStoreProduct(db: Database, input: NewStoreProduct): Promise<StoreProduct>`
  - `getStoreProductBySlug(db: Executor, slug: string): Promise<StoreProductWithInventory | null>`
  - `getStoreProductById(db: Executor, id: string): Promise<StoreProductWithInventory | null>`
  - `listStoreProducts(db: Executor, options?: { publishedOnly?: boolean }): Promise<StoreProductWithInventory[]>`
  - `adjustStock(db: Database, input: { productId: string; delta: number; reason: StockAdjustmentReason; actor: string; note?: string | null }): Promise<StoreInventory>`
  - `listStockMovements(db: Executor, productId: string, limit?: number)` → filas con `id, createdAt, deltaOnHand, deltaReserved, reason, actor, note, orderNumber`

- [ ] **Step 1: Write the failing test**

Crear `packages/database/tests/store-inventory.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../src/client.ts";
import {
  adjustStock,
  getStoreProductById,
  getStoreProductBySlug,
  InvalidStockAdjustmentError,
  listStockMovements,
  listStoreProducts,
  StockBelowReservedError,
  StoreProductNotFoundError,
  upsertStoreProduct,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const slug = () => `producto-${randomUUID().slice(0, 8)}`;

describe("productos", () => {
  it("crea el producto con inventario en cero, sin precio y oculto", async () => {
    const product = await upsertStoreProduct(db, { slug: slug(), name: "UNO+UNO" });
    expect(product).toMatchObject({ price: null, published: false, saleStatus: "coming_soon" });
    expect(await getStoreProductById(db, product.id)).toMatchObject({ onHand: 0, reserved: 0, available: 0 });
  });

  it("actualizar por slug cambia los datos y conserva las existencias", async () => {
    const s = slug();
    const created = await upsertStoreProduct(db, { slug: s, name: "Antes" });
    await adjustStock(db, { productId: created.id, delta: 7, reason: "reception", actor: "test" });
    const updated = await upsertStoreProduct(db, { slug: s, name: "Después", price: 50_000, published: true, saleStatus: "on_sale" });
    expect(updated.id).toBe(created.id);
    expect(await getStoreProductBySlug(db, s)).toMatchObject({ name: "Después", price: 50_000, onHand: 7, available: 7 });
  });

  it("busca por slug y por id; devuelve null si no existe", async () => {
    const created = await upsertStoreProduct(db, { slug: slug(), name: "Existe" });
    expect((await getStoreProductBySlug(db, created.slug))?.id).toBe(created.id);
    expect(await getStoreProductBySlug(db, "no-existe")).toBeNull();
    expect(await getStoreProductById(db, randomUUID())).toBeNull();
  });

  it("lista solo los publicados cuando se pide", async () => {
    const visible = await upsertStoreProduct(db, { slug: slug(), name: "Visible", published: true });
    const hidden = await upsertStoreProduct(db, { slug: slug(), name: "Oculto", published: false });
    const published = (await listStoreProducts(db, { publishedOnly: true })).map((p) => p.id);
    expect(published).toContain(visible.id);
    expect(published).not.toContain(hidden.id);
    expect((await listStoreProducts(db)).map((p) => p.id)).toEqual(expect.arrayContaining([visible.id, hidden.id]));
  });
});

describe("ajuste de existencias", () => {
  it("suma y resta con motivo y deja un movimiento por cada cambio", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Con stock" });
    await adjustStock(db, { productId: id, delta: 10, reason: "reception", actor: "karina@ejemplo.com", note: "Primer lote" });
    const after = await adjustStock(db, { productId: id, delta: -3, reason: "damage", actor: "karina@ejemplo.com" });
    expect(after).toMatchObject({ onHand: 7, reserved: 0 });

    const movements = await listStockMovements(db, id);
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => [m.reason, m.deltaOnHand, m.deltaReserved, m.actor, m.orderNumber]).sort()).toEqual(
      [
        ["damage", -3, 0, "karina@ejemplo.com", null],
        ["reception", 10, 0, "karina@ejemplo.com", null],
      ].sort(),
    );
    expect(movements.find((m) => m.reason === "reception")?.note).toBe("Primer lote");
  });

  it("rechaza ajustes sin sentido", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Reglas" });
    await expect(adjustStock(db, { productId: id, delta: 0, reason: "adjustment", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: 1.5, reason: "adjustment", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: -2, reason: "reception", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: -2, reason: "return", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: 2, reason: "damage", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    expect(await listStockMovements(db, id)).toHaveLength(0);
  });

  it("no deja las existencias por debajo de lo apartado", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Apartado" });
    await adjustStock(db, { productId: id, delta: 7, reason: "reception", actor: "t" });
    await db.execute(sql`update store_inventory set reserved = 4 where product_id = ${id}`);
    await expect(adjustStock(db, { productId: id, delta: -4, reason: "correction", actor: "t" })).rejects.toMatchObject({ name: "StockBelowReservedError", reserved: 4 });
    await expect(adjustStock(db, { productId: id, delta: -4, reason: "correction", actor: "t" })).rejects.toBeInstanceOf(StockBelowReservedError);
    expect(await adjustStock(db, { productId: id, delta: -3, reason: "correction", actor: "t" })).toMatchObject({ onHand: 4, reserved: 4 });
  });

  it("falla con un producto que no existe", async () => {
    await expect(adjustStock(db, { productId: randomUUID(), delta: 1, reason: "reception", actor: "t" })).rejects.toBeInstanceOf(StoreProductNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-inventory.test.ts`
Expected: FAIL — no se puede resolver `../src/store.ts`.

- [ ] **Step 3: Implementar**

Crear `packages/database/src/store.ts`:

```ts
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
```

En `packages/database/src/index.ts`, añadir debajo de `export * from "./presale.ts";`:

```ts
export * from "./store.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-inventory.test.ts`
Expected: PASS (8 tests).

Run: `pnpm --filter @inttimo/database typecheck`
Expected: sin errores. Si `selectWithInventory(db).where(...)` no tipa con `Executor`, usar el patrón de otras consultas de `presale.ts` y anotar la desviación en el reporte.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/store.ts packages/database/src/index.ts packages/database/tests/store-inventory.test.ts
git commit -m "feat(inttimo): store products and auditable stock adjustments"
```

---

### Task 3: Pedidos con apartado de stock

**Files:**
- Modify: `packages/database/src/store.ts` (reemplazar el bloque de imports y añadir al final)
- Create: `packages/database/tests/store-helpers.ts`
- Test: `packages/database/tests/store-orders.test.ts`

**Interfaces:**
- Consumes: `upsertStoreProduct`, `adjustStock`, `StoreProduct`, `NewStoreProduct` (Task 2).
- Produces:
  - Tipos: `StoreOrder`, `StoreOrderItem`, `NewStoreOrderLine = { productId: string; quantity: number }`, `NewStoreOrder`
  - Errores: `InvalidStoreOrderError`, `StoreProductUnavailableError` (`productId`), `InsufficientStoreStockError` (`productId`, `available`)
  - `generateOrderNumber(): string`
  - `createStoreOrder(db: Database, input: NewStoreOrder, now?: Date): Promise<{ order: StoreOrder; items: StoreOrderItem[]; reused: boolean }>`
  - `attachStoreCheckoutSession(db: Database, orderId: string, session: { id: string; url: string; expiresAt: Date }): Promise<StoreOrder | null>`
  - `findStoreOrderById / findStoreOrderByNumber / findStoreOrderBySessionId (db: Executor, …): Promise<StoreOrder | null>`
  - `listStoreOrderItems(db: Executor, orderId: string): Promise<StoreOrderItem[]>`
  - `addStoreOrderEvent(db: Executor, orderId: string, type: StoreOrderEventType, source: EventSource, extra?: { actor?: string | null; externalRef?: string | null; metadata?: Record<string, unknown> }): Promise<void>`
  - `listStoreOrderEvents(db: Executor, orderId: string)`
  - `addStoreOrderNote(db: Executor, input: { orderId: string; body: string; authorEmail: string }): Promise<StoreOrderNote>`; `listStoreOrderNotes(db: Executor, orderId: string): Promise<StoreOrderNote[]>`
  - Helpers de prueba (`tests/store-helpers.ts`): `seedProduct`, `pickupOrder`, `inventoryOf`, `expectLedgerMatches`

- [ ] **Step 1: Crear los helpers de prueba**

Crear `packages/database/tests/store-helpers.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing test**

Crear `packages/database/tests/store-orders.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  addStoreOrderNote,
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderById,
  findStoreOrderByNumber,
  findStoreOrderBySessionId,
  InsufficientStoreStockError,
  InvalidStoreOrderError,
  listStockMovements,
  listStoreOrderEvents,
  listStoreOrderItems,
  listStoreOrderNotes,
  StoreProductUnavailableError,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const ADDRESS = { name: "Ana Pérez", phone: "6141234567", street: "Calle 1 #100", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", reference: null };
const SELECTION = { provider: "skydropx" as const, quotationId: "quo_1", rateId: "rate_1", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: "2026-10-07T12:00:00.000Z" };

describe("crear pedido", () => {
  it("aparta el stock, toma el precio de la base y copia las líneas", async () => {
    const product = await seedProduct(db, { stock: 5, price: 50_000, sku: `SKU-${randomUUID().slice(0, 6)}` });
    const { order, items, reused } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 2 }]));

    expect(reused).toBe(false);
    expect(order.orderNumber).toMatch(/^INT-[2-9A-HJ-NP-Z]{10}$/);
    expect(order).toMatchObject({
      paymentStatus: "pending",
      fulfillmentStatus: "confirmed",
      email: "ana@ejemplo.com",
      subtotalAmount: 100_000,
      shippingAmount: 0,
      totalAmount: 100_000,
      currency: "mxn",
      inventoryReserved: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: product.id, productSlug: product.slug, name: "Producto de prueba", sku: product.sku, quantity: 2, unitAmount: 50_000 });

    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 2 });
    const reservation = (await listStockMovements(db, product.id)).find((m) => m.reason === "reservation");
    expect(reservation).toMatchObject({ deltaOnHand: 0, deltaReserved: 2, orderNumber: order.orderNumber, actor: "system" });
    expect((await listStoreOrderEvents(db, order.id)).map((e) => e.type)).toEqual(expect.arrayContaining(["ORDER_CREATED", "INVENTORY_RESERVED"]));
    await expectLedgerMatches(db, product.id);
  });

  it("junta las líneas repetidas de un mismo producto", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { items, order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }]));
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(3);
    expect(order.subtotalAmount).toBe(150_000);
  });

  it("con envío suma el costo al total; en recolección no se puede cobrar envío", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const shipping = await createStoreOrder(
      db,
      pickupOrder([{ productId: product.id, quantity: 1 }], { delivery: { method: "shipping", address: ADDRESS, selection: SELECTION }, shippingAmount: 18_000 }),
    );
    expect(shipping.order).toMatchObject({ deliveryMethod: "shipping", subtotalAmount: 50_000, shippingAmount: 18_000, totalAmount: 68_000, pickupPointId: null });
    expect(shipping.order.deliveryAddress).toMatchObject({ street: "Calle 1 #100" });

    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }], { shippingAmount: 100 }))).rejects.toBeInstanceOf(InvalidStoreOrderError);
  });

  it("rechaza pedidos vacíos y cantidades inválidas", async () => {
    const product = await seedProduct(db, { stock: 5 });
    await expect(createStoreOrder(db, pickupOrder([]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 0 }]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1.5 }]))).rejects.toBeInstanceOf(InvalidStoreOrderError);
  });
});

describe("sin sobreventa", () => {
  it("rechaza lo que supera lo disponible y no cambia nada", async () => {
    const product = await seedProduct(db, { stock: 2 });
    await expect(createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 3 }]))).rejects.toMatchObject({ name: "InsufficientStoreStockError", available: 2, productId: product.id });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 2, reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("con varios productos es todo o nada", async () => {
    const plenty = await seedProduct(db, { stock: 5 });
    const scarce = await seedProduct(db, { stock: 1 });
    await expect(
      createStoreOrder(db, pickupOrder([{ productId: plenty.id, quantity: 2 }, { productId: scarce.id, quantity: 2 }])),
    ).rejects.toBeInstanceOf(InsufficientStoreStockError);
    expect(await inventoryOf(db, plenty.id)).toMatchObject({ reserved: 0 });
    expect(await inventoryOf(db, scarce.id)).toMatchObject({ reserved: 0 });
  });

  it("dos compras a la vez por la última pieza: solo una gana", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const results = await Promise.allSettled([
      createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }])),
      createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }])),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(InsufficientStoreStockError);
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 1, reserved: 1 });
    await expectLedgerMatches(db, product.id);
  });

  it("no vende productos ocultos, sin precio, próximamente o inexistentes", async () => {
    const hidden = await seedProduct(db, { published: false });
    const noPrice = await seedProduct(db, { price: null });
    const soon = await seedProduct(db, { saleStatus: "coming_soon" });
    for (const productId of [hidden.id, noPrice.id, soon.id, randomUUID()]) {
      await expect(createStoreOrder(db, pickupOrder([{ productId, quantity: 1 }]))).rejects.toBeInstanceOf(StoreProductUnavailableError);
    }
    expect(await inventoryOf(db, hidden.id)).toMatchObject({ reserved: 0 });
  });
});

describe("idempotencia", () => {
  it("la misma clave devuelve el mismo pedido y aparta una sola vez", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const input = pickupOrder([{ productId: product.id, quantity: 2 }], { idempotencyKey: `clave-${randomUUID()}` });
    const first = await createStoreOrder(db, input);
    const second = await createStoreOrder(db, input);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.items).toHaveLength(1);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 2 });
  });
});

describe("consultas, sesión de pago y notas", () => {
  it("liga la sesión de Stripe una sola vez y permite buscar por folio, id y sesión", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    const sessionId = `cs_test_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 60_000);

    const attached = await attachStoreCheckoutSession(db, order.id, { id: sessionId, url: "https://checkout.stripe.test/x", expiresAt });
    expect(attached).toMatchObject({ stripeCheckoutSessionId: sessionId, stripeCheckoutUrl: "https://checkout.stripe.test/x" });
    expect(await attachStoreCheckoutSession(db, order.id, { id: "otra", url: "https://x.test", expiresAt })).toBeNull();

    expect((await findStoreOrderById(db, order.id))?.id).toBe(order.id);
    expect((await findStoreOrderByNumber(db, order.orderNumber))?.id).toBe(order.id);
    expect((await findStoreOrderBySessionId(db, sessionId))?.id).toBe(order.id);
    expect(await findStoreOrderByNumber(db, "INT-NOEXISTE")).toBeNull();
    expect((await listStoreOrderItems(db, order.id))[0]).toMatchObject({ quantity: 1 });
    expect((await listStoreOrderEvents(db, order.id)).map((e) => e.type)).toContain("CHECKOUT_CREATED");
  });

  it("las notas internas se agregan con autor y se listan en orden", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    await addStoreOrderNote(db, { orderId: order.id, body: "Primera", authorEmail: "karina@ejemplo.com" });
    await addStoreOrderNote(db, { orderId: order.id, body: "Segunda", authorEmail: "leo@ejemplo.com" });
    expect((await listStoreOrderNotes(db, order.id)).map((n) => [n.body, n.authorEmail])).toEqual([
      ["Primera", "karina@ejemplo.com"],
      ["Segunda", "leo@ejemplo.com"],
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-orders.test.ts`
Expected: FAIL — `createStoreOrder` y los demás nombres no existen en `../src/store.ts`.

- [ ] **Step 4: Implementar**

En `packages/database/src/store.ts`, **reemplazar el bloque de imports** (las primeras 4 líneas) por:

```ts
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import type { EventSource, Executor } from "./presale.ts";
import type { DeliveryAddress, ShippingSelection } from "./schema/presale.ts";
import { storeInventory, storeOrderEvents, storeOrderItems, storeOrderNotes, storeOrders, storeProducts, storeStockMovements, type StoreOrderEventType } from "./schema/store.ts";
```

Añadir **al final** del archivo:

```ts
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
    super(`Solo quedan ${available} unidades.`);
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

function mergeLines(lines: NewStoreOrderLine[]): NewStoreOrderLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
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
  const lines = mergeLines(input.lines);
  if (!lines.length) throw new InvalidStoreOrderError("El pedido no tiene productos.");
  if (input.delivery.method === "pickup" && input.shippingAmount !== 0) throw new InvalidStoreOrderError("La recolección no tiene costo de envío.");
  if (!Number.isInteger(input.shippingAmount) || input.shippingAmount < 0) throw new InvalidStoreOrderError("El costo de envío no es válido.");
  const productIds = lines.map((line) => line.productId);

  return db.transaction(async (tx) => {
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
  return db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, orderId)).orderBy(asc(storeOrderItems.createdAt), asc(storeOrderItems.id));
}

export async function listStoreOrderEvents(db: Executor, orderId: string) {
  return db.select().from(storeOrderEvents).where(eq(storeOrderEvents.orderId, orderId)).orderBy(asc(storeOrderEvents.createdAt), asc(storeOrderEvents.id));
}

export async function addStoreOrderNote(db: Executor, input: { orderId: string; body: string; authorEmail: string }): Promise<StoreOrderNote> {
  const [row] = await db.insert(storeOrderNotes).values(input).returning();
  return row!;
}

export async function listStoreOrderNotes(db: Executor, orderId: string): Promise<StoreOrderNote[]> {
  return db.select().from(storeOrderNotes).where(eq(storeOrderNotes.orderId, orderId)).orderBy(asc(storeOrderNotes.createdAt), asc(storeOrderNotes.id));
}
```

Nota: `desc` y `getTableColumns` ya se usan en la parte de productos e inventario (Task 2); no quitarlos del import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-orders.test.ts`
Expected: PASS (11 tests). El test de notas inserta cada nota en una llamada separada (transacciones distintas), así que el orden por `created_at` es estable. Dentro de una misma transacción varias filas comparten `created_at` y su orden no está garantizado: no escribir pruebas que dependan de él.

Run: `pnpm --filter @inttimo/database typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/store.ts packages/database/tests/store-helpers.ts packages/database/tests/store-orders.test.ts
git commit -m "feat(inttimo): store orders with stock reservation and idempotency"
```

---

### Task 4: Pago, liberación por vencimiento y pagos tardíos

**Files:**
- Modify: `packages/database/src/store.ts` (imports, `createStoreOrder` y funciones nuevas)
- Test: `packages/database/tests/store-payments.test.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 2 y 3, incluidos los helpers de `tests/store-helpers.ts`.
- Produces:
  - `type StorePaidOutcome = "paid" | "already_paid" | "paid_oversold"`
  - `markStoreOrderPaid(db: Database, orderId: string, details: { paymentIntentId?: string | null }, ctx: { source: EventSource; externalRef?: string | null }, now?: Date): Promise<{ order: StoreOrder; outcome: StorePaidOutcome } | null>`
  - `markStoreOrderPaymentFailed(db: Database, orderId: string, ctx: { source: EventSource }): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `markStoreCheckoutCreateFailed(db: Database, orderId: string, reason: string): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `releaseExpiredStoreOrders(db: Database, now?: Date): Promise<number>`
  - `STORE_HOLD_GRACE_MINUTES = 5`
  - `createStoreOrder` ahora libera antes lo vencido.

- [ ] **Step 1: Write the failing test**

Crear `packages/database/tests/store-payments.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderById,
  listStockMovements,
  listStoreOrderEvents,
  markStoreCheckoutCreateFailed,
  markStoreOrderPaid,
  markStoreOrderPaymentFailed,
  releaseExpiredStoreOrders,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { expectLedgerMatches, inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

// Base nueva por prueba: `releaseExpiredStoreOrders` es global y no debe ver pedidos de otras pruebas.
beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const stripe = { source: "stripe" as const };

async function place(productId: string, quantity: number, now?: Date) {
  return (await createStoreOrder(db, pickupOrder([{ productId, quantity }]), now)).order;
}

async function placeWithSession(productId: string, quantity: number) {
  const order = await place(productId, quantity);
  await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutes(30) });
  return order;
}

const eventTypes = async (orderId: string) => (await listStoreOrderEvents(db, orderId)).map((e) => e.type);

describe("pago confirmado", () => {
  it("descuenta las existencias, libera el apartado y deja el historial", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);

    const result = await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_test_1" }, { source: "stripe", externalRef: "evt_1" });
    expect(result?.outcome).toBe("paid");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", inventoryReserved: false, stripePaymentIntentId: "pi_test_1", fulfillmentStatus: "confirmed" });
    expect(result?.order.paidAt).toBeInstanceOf(Date);

    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    const sale = (await listStockMovements(db, product.id)).find((m) => m.reason === "sale");
    expect(sale).toMatchObject({ deltaOnHand: -2, deltaReserved: -2, orderNumber: order.orderNumber });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["PAYMENT_APPROVED", "INVENTORY_COMMITTED"]));
    await expectLedgerMatches(db, product.id);
  });

  it("un webhook repetido no cambia nada", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);
    await markStoreOrderPaid(db, order.id, {}, stripe);
    const again = await markStoreOrderPaid(db, order.id, {}, stripe);

    expect(again?.outcome).toBe("already_paid");
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    expect((await eventTypes(order.id)).filter((type) => type === "PAYMENT_APPROVED")).toHaveLength(1);
    await expectLedgerMatches(db, product.id);
  });

  it("devuelve null si el pedido no existe", async () => {
    expect(await markStoreOrderPaid(db, "00000000-0000-4000-8000-000000000000", {}, stripe)).toBeNull();
  });
});

describe("pago fallido y error al crear el pago", () => {
  it("libera lo apartado una sola vez", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 2);

    const first = await markStoreOrderPaymentFailed(db, order.id, stripe);
    expect(first?.changed).toBe(true);
    expect(first?.order).toMatchObject({ paymentStatus: "failed", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["PAYMENT_FAILED", "INVENTORY_RELEASED"]));

    expect((await markStoreOrderPaymentFailed(db, order.id, stripe))?.changed).toBe(false);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("si Stripe no crea la sesión, libera y registra el motivo", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await place(product.id, 1);
    const result = await markStoreCheckoutCreateFailed(db, order.id, "stripe caído");
    expect(result?.changed).toBe(true);
    expect(result?.order.paymentStatus).toBe("failed");
    const failed = (await listStoreOrderEvents(db, order.id)).find((e) => e.type === "CHECKOUT_CREATE_FAILED");
    expect(failed?.metadata).toMatchObject({ reason: "stripe caído" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
    await expectLedgerMatches(db, product.id);
  });
});

describe("vencimiento", () => {
  it("libera el pedido cuando vence la sesión más los 5 minutos de gracia", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 2);

    expect(await releaseExpiredStoreOrders(db, minutes(34))).toBe(0);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 2 });

    expect(await releaseExpiredStoreOrders(db, minutes(36))).toBe(1);
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ paymentStatus: "cancelled", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await eventTypes(order.id)).toEqual(expect.arrayContaining(["CHECKOUT_EXPIRED", "INVENTORY_RELEASED"]));
    expect(await releaseExpiredStoreOrders(db, minutes(60))).toBe(0);
    await expectLedgerMatches(db, product.id);
  });

  it("un pedido sin sesión se libera a los 5 minutos", async () => {
    const product = await seedProduct(db, { stock: 5 });
    await place(product.id, 1);
    expect(await releaseExpiredStoreOrders(db, new Date(Date.now() + 2 * 60_000))).toBe(0);
    expect(await releaseExpiredStoreOrders(db, new Date(Date.now() + 6 * 60_000))).toBe(1);
    expect(await inventoryOf(db, product.id)).toMatchObject({ reserved: 0 });
  });

  it("nunca libera un pedido pagado", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 1);
    await markStoreOrderPaid(db, order.id, {}, stripe);
    expect(await releaseExpiredStoreOrders(db, minutes(600))).toBe(0);
    expect(await findStoreOrderById(db, order.id)).toMatchObject({ paymentStatus: "paid" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 4, reserved: 0 });
  });

  it("crear un pedido libera antes lo vencido, así la última pieza vuelve a estar disponible", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const stale = await place(product.id, 1);
    const later = new Date(Date.now() + 10 * 60_000);

    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]), later);
    expect(order.inventoryReserved).toBe(true);
    expect(await findStoreOrderById(db, stale.id)).toMatchObject({ paymentStatus: "cancelled", inventoryReserved: false });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 1, reserved: 1 });
    await expectLedgerMatches(db, product.id);
  });
});

describe("pago que llega tarde", () => {
  it("con stock disponible vuelve a descontar y el pedido queda pagado", async () => {
    const product = await seedProduct(db, { stock: 5 });
    const order = await placeWithSession(product.id, 2);
    await releaseExpiredStoreOrders(db, minutes(40));
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 5, reserved: 0 });

    const result = await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_late" }, stripe);
    expect(result?.outcome).toBe("paid");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "confirmed" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 3, reserved: 0 });
    const sale = (await listStockMovements(db, product.id)).find((m) => m.reason === "sale");
    expect(sale).toMatchObject({ deltaOnHand: -2, deltaReserved: 0 });
    await expectLedgerMatches(db, product.id);
  });

  it("sin stock queda pagado y marcado como excepción, sin vender lo que no existe", async () => {
    const product = await seedProduct(db, { stock: 1 });
    const late = await placeWithSession(product.id, 1);
    await releaseExpiredStoreOrders(db, minutes(40));

    const other = await place(product.id, 1, minutes(40));
    await markStoreOrderPaid(db, other.id, {}, stripe);
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 0, reserved: 0 });

    const result = await markStoreOrderPaid(db, late.id, {}, stripe);
    expect(result?.outcome).toBe("paid_oversold");
    expect(result?.order).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "exception" });
    expect(await inventoryOf(db, product.id)).toMatchObject({ onHand: 0, reserved: 0 });
    const exception = (await listStoreOrderEvents(db, late.id)).find((e) => e.type === "EXCEPTION");
    expect(exception?.metadata).toMatchObject({ reason: "oversold_after_release" });
    expect(await eventTypes(late.id)).toContain("PAYMENT_APPROVED");
    expect(await eventTypes(late.id)).not.toContain("INVENTORY_COMMITTED");
    await expectLedgerMatches(db, product.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-payments.test.ts`
Expected: FAIL — `markStoreOrderPaid` y las demás funciones no existen.

- [ ] **Step 3: Implementar**

En `packages/database/src/store.ts`, cambiar la línea de imports de `drizzle-orm` por:

```ts
import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, or, sql } from "drizzle-orm";
```

Dentro de `createStoreOrder`, como **primera línea del cuerpo** (antes de `const lines = mergeLines(input.lines);`), añadir:

```ts
  // Libera lo que ya venció antes de contar lo disponible (transacciones separadas; siempre idempotente).
  await releaseExpiredStoreOrders(db, now);
```

Añadir **al final** del archivo:

```ts
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
    if (order.inventoryReserved) await releaseReservedStock(tx, order, items, close.source);
    const [updated] = await tx.update(storeOrders).set({ paymentStatus: close.paymentStatus }).where(eq(storeOrders.id, orderId)).returning();
    await addStoreOrderEvent(tx, orderId, close.event, close.source, { metadata: close.metadata });
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-payments.test.ts`
Expected: PASS (11 tests).

Run: `pnpm --filter @inttimo/database test`
Expected: PASS (todas las pruebas del paquete, incluidas las de la Task 3 con la nueva llamada a `releaseExpiredStoreOrders`).

Run: `pnpm --filter @inttimo/database typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/store.ts packages/database/tests/store-payments.test.ts
git commit -m "feat(inttimo): store payment lifecycle, expiry release and late payments"
```

---

### Task 5: Carga inicial de UNO+UNO y documento del plan general

**Files:**
- Create: `apps/inttimo/scripts/store-seed.ts`
- Modify: `apps/inttimo/package.json` (script `store:seed`)
- Modify: `package.json` (script `store:seed`)
- Modify: `CLAUDE.md` (§46, lista de comandos)
- Create: `docs/store/BACKEND-PLAN.md`

**Interfaces:**
- Consumes: `createDatabase`, `getStoreProductBySlug`, `upsertStoreProduct` (Tasks 2 y 1).
- Produces: comando `pnpm store:seed`.

- [ ] **Step 1: Crear el script**

Crear `apps/inttimo/scripts/store-seed.ts`:

```ts
/**
 * Carga el catálogo inicial de la tienda (hoy solo UNO+UNO): sin precio, como "próximamente" y con 0 existencias.
 *
 *   pnpm store:seed                  # escribe en la base de DATABASE_URL (la local por defecto)
 *   pnpm store:seed --allow-remote   # obligatorio si DATABASE_URL no es localhost (producción)
 *
 * Si el producto ya existe no cambia nada (no pisa el precio ni las existencias que se hayan fijado desde el panel).
 * El peso y las medidas salen del paquete de la preventa (docs/preventa/uno-mas-uno.json).
 */
import { readFile } from "node:fs/promises";
import { createDatabase, getStoreProductBySlug, upsertStoreProduct } from "@inttimo/database";
import { fail, flag } from "./cli.ts";

const url = process.env.DATABASE_URL ?? fail("Falta DATABASE_URL.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !flag("allow-remote")) {
  fail(`DATABASE_URL apunta a ${host}, no a una base local. Si de verdad es la base real, repite con --allow-remote.`);
}
console.log(`Base: ${host}`);

const db = createDatabase(url);
const SLUG = "uno-mas-uno";

if (await getStoreProductBySlug(db, SLUG)) {
  console.log(`  ${SLUG}: ya existe, sin cambios.`);
  process.exit(0);
}

const campaign = JSON.parse(await readFile(new URL("../../../docs/preventa/uno-mas-uno.json", import.meta.url), "utf8")) as {
  shippingProfile?: { parcel?: { weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number } };
};
const parcel = campaign.shippingProfile?.parcel;

const product = await upsertStoreProduct(db, {
  slug: SLUG,
  name: "UNO+UNO",
  type: "physical",
  saleStatus: "coming_soon",
  published: true,
  price: null,
  weightGrams: parcel?.weightKg ? Math.round(parcel.weightKg * 1000) : null,
  lengthCm: parcel?.lengthCm ?? null,
  widthCm: parcel?.widthCm ?? null,
  heightCm: parcel?.heightCm ?? null,
  // Misma clasificación que el simulador del frontend (src/lib/store/mock.ts); confirmar con Karina.
  territories: ["conversacion", "conexion", "intimidad", "conocimiento"],
});
console.log(`  ${product.slug}: creado (próximamente, sin precio, 0 existencias).`);
process.exit(0);
```

- [ ] **Step 2: Registrar el comando**

En `apps/inttimo/package.json`, añadir **después** de la línea `"presale:reconcile": …,`:

```json
    "store:seed": "node --env-file-if-exists=../../.env --experimental-strip-types --no-warnings scripts/store-seed.ts",
```

En `package.json` (raíz), añadir **después** de la línea `"presale:reconcile": "pnpm --filter inttimo presale:reconcile",`:

```json
    "store:seed": "pnpm --filter inttimo store:seed",
```

En `CLAUDE.md` §46, añadir **después** de la línea `pnpm presale:reconcile            # sincronizar con Stripe si falló un webhook`:

```text
pnpm store:seed                   # catálogo inicial de la tienda (UNO+UNO sin precio); en una base remota exige --allow-remote
```

- [ ] **Step 3: Verificar contra la base local**

Run: `pnpm db:migrate`
Expected: `Migraciones aplicadas.` (aplica la 0010 en la base local `127.0.0.1:55322`; requiere `pnpm supabase:start`).

Run: `pnpm store:seed`
Expected:

```text
Base: 127.0.0.1
  uno-mas-uno: creado (próximamente, sin precio, 0 existencias).
```

Run: `pnpm store:seed`
Expected: `  uno-mas-uno: ya existe, sin cambios.`

Run: `docker exec -i supabase_db_karina-reyes-ecommerce psql -U postgres -tAc "select slug, sale_status, published, price, weight_grams, on_hand from store_products p join store_inventory i on i.product_id = p.id"`
Expected: `uno-mas-uno|coming_soon|t||1000|0`

Probar el seguro: `DATABASE_URL=postgresql://u:p@db.ejemplo.com:5432/x pnpm store:seed`
Expected: falla con `DATABASE_URL apunta a db.ejemplo.com, no a una base local…` sin conectarse.

- [ ] **Step 4: Documento del plan general**

Crear `docs/store/BACKEND-PLAN.md`:

```markdown
# Backend de la tienda: plan general

Implementa lo que pide frontend en [BACKEND-REQUEST.md](./BACKEND-REQUEST.md) y en `apps/inttimo/src/lib/store/contract.ts` + `admin-contract.ts`. Decisión del usuario (2026-10-07): construir **todo** antes de abrir la tienda. La tienda sigue oculta en producción (`NEXT_PUBLIC_STORE_ENABLED`) hasta que el usuario la active, al terminar la preventa.

| # | Subproyecto | Estado |
|---|---|---|
| 0 | Poner al día el PR #19 con `main` | hecho |
| 1 | Base de datos e inventario ([diseño](./subproyecto-1-diseno.md), [plan](./subproyecto-1-plan.md)) | en curso |
| 2 | Catálogo y carrito: `GET /api/tienda/productos`, `/productos/[slug]`, `POST /carrito/cotizar` | pendiente |
| 3 | Entrega, envío y código postal: `/entrega`, `/envio/cotizar`, `/codigo-postal/[cp]` | pendiente |
| 4 | Checkout, Stripe y webhook: `/checkout`, `/pedido/confirmacion` | pendiente |
| 5 | Pedidos de la tienda en el panel, con reembolsos y cancelación | pendiente |
| 6 | Productos e inventario en el panel | pendiente |
| 7 | Rastreo, cuenta, contacto, iglesias y newsletter | pendiente |
| 8 | Resumen del panel | pendiente |

## Decisiones

- Los pedidos de la tienda viven en tablas `store_*`, separadas de `presale_*` (la preventa tiene dinero real y sigue abierta hasta el 15 de octubre de 2026). Se comparte el código de Stripe, SkyDropX y correos.
- Stock sin sobreventa: se aparta al iniciar el checkout, se descuenta al confirmarse el pago y se libera si el pago no llega (sesión de 30 minutos más 5 de gracia). Un pago tardío sin stock deja el pedido pagado como excepción para reembolsarlo.
- Si el contrato de frontend debe cambiar, se edita `contract.ts` y el simulador (`mock.ts`) en el mismo PR que el endpoint.

## Pendientes de negocio (no inventar)

1. **Precio de tienda** de UNO+UNO (hoy `price = null`: el producto no se puede comprar).
2. **Términos y Condiciones de la tienda** (los actuales son de la preventa).
3. **Paquetes y precios para iglesias.**
4. **Proveedor de newsletter** y de correos de la tienda.
5. **Fotos y textos oficiales.**
6. **Máximo por pedido de UNO+UNO** (hoy 10, el valor por defecto) y **clasificación por territorios** (copiada del simulador).
7. **Cupones:** el contrato los menciona pero no están en el alcance; decidir antes del subproyecto 2.
```

- [ ] **Step 5: Verificar y commit**

Run: `pnpm lint && pnpm typecheck`
Expected: sin errores.

```bash
git add apps/inttimo/scripts/store-seed.ts apps/inttimo/package.json package.json CLAUDE.md docs/store/BACKEND-PLAN.md
git commit -m "feat(inttimo): store:seed for UNO+UNO and backend plan doc"
```

---

### Task 6: Ajuste del contrato de movimientos de stock (archivos de frontend)

**Files:**
- Modify: `apps/inttimo/src/lib/store/admin-contract.ts:101`
- Modify: `apps/inttimo/src/lib/store/admin-mock.ts:133-135` y `:267`
- Modify: `apps/inttimo/src/components/store/admin/AdminProducts.tsx:236-250`
- Modify: `docs/store/BACKEND-REQUEST.md` (fila A8)

**Interfaces:**
- Consumes: `StoreStockMovement` tiene `deltaOnHand` y `deltaReserved` (Task 1).
- Produces: `StockMovement` del contrato con `deltaOnHand: number` y `deltaReserved: number` en lugar de `delta`. `StockAdjustmentRequest.delta` **no cambia** (es lo que pide el usuario).

- [ ] **Step 1: Confirmar el estado actual**

Run: `pnpm typecheck`
Expected: sin errores (línea base antes de tocar nada).

- [ ] **Step 2: Cambiar el tipo (el compilador marcará lo que falta)**

En `apps/inttimo/src/lib/store/admin-contract.ts`, reemplazar la línea 101:

```ts
export type StockMovement = { id: string; at: string; delta: number; reason: StockMovementReason | "sale" | "reservation" | "release"; actor: string | null; orderNumber: string | null; note: string | null };
```

por:

```ts
/**
 * `deltaOnHand` cambia las existencias y `deltaReserved` lo apartado en pedidos: una reserva no cambia las existencias,
 * una venta cambia las dos. Sin los dos números no se distingue una reserva de una recepción.
 */
export type StockMovement = {
  id: string;
  at: string;
  deltaOnHand: number;
  deltaReserved: number;
  reason: StockMovementReason | "sale" | "reservation" | "release";
  actor: string | null;
  orderNumber: string | null;
  note: string | null;
};
```

Run: `pnpm typecheck`
Expected: FALLA en `admin-mock.ts` (líneas 133-135 y 267) y en `AdminProducts.tsx` (línea 245). Es lo esperado.

- [ ] **Step 3: Actualizar el simulador**

En `apps/inttimo/src/lib/store/admin-mock.ts`, reemplazar las tres líneas de `movements` (133 a 135):

```ts
    { id: "mov_1", at: ago(240), deltaOnHand: 50, deltaReserved: 0, reason: "reception", actor: "equipo@ejemplo.com", orderNumber: null, note: "Recepción de EJEMPLO" },
    { id: "mov_2", at: ago(72), deltaOnHand: -3, deltaReserved: -3, reason: "sale", actor: null, orderNumber: "INT-EJEMPLO-0005", note: null },
    { id: "mov_3", at: ago(26), deltaOnHand: -2, deltaReserved: -2, reason: "sale", actor: null, orderNumber: "INT-EJEMPLO-0002", note: null },
```

y en `adjustStock` (línea 267) reemplazar `{ id: \`mov_${Date.now()}\`, at: now(), delta, reason, actor: "tú (simulación)", orderNumber: null, note: note ?? null }` por:

```ts
{ id: `mov_${Date.now()}`, at: now(), deltaOnHand: delta, deltaReserved: 0, reason, actor: "tú (simulación)", orderNumber: null, note: note ?? null }
```

- [ ] **Step 4: Actualizar la pantalla**

En `apps/inttimo/src/components/store/admin/AdminProducts.tsx`, justo **antes** de la función que contiene el `movements.map` (la que devuelve `<EmptyState title="Sin movimientos todavía." />`), añadir:

```tsx
/** Cambio de existencias; si el movimiento solo apartó o liberó unidades, muestra el cambio de apartado. */
function MovementAmount({ movement }: { movement: StockMovement }) {
  const reserved = movement.deltaOnHand === 0;
  const value = reserved ? movement.deltaReserved : movement.deltaOnHand;
  return (
    <span className={`font-semibold lining-nums ${value > 0 ? "text-success" : "text-danger"}`}>
      {value > 0 ? "+" : "−"}
      {Math.abs(value)}
      {reserved && <span className="ml-1 text-xs font-normal text-muted">apartado</span>}
    </span>
  );
}
```

y reemplazar la línea del `<span className={\`font-semibold lining-nums ${m.delta > 0 …` (la de `{m.delta > 0 ? "+" : "−"}{Math.abs(m.delta)}`) por:

```tsx
          <MovementAmount movement={m} />
```

(`StockMovement` ya está importado en ese archivo desde `@/lib/store/admin-contract`.)

- [ ] **Step 5: Documentar en la solicitud de backend**

En `docs/store/BACKEND-REQUEST.md`, fila A8, reemplazar el texto exacto `Las existencias no pueden quedar debajo de lo apartado.` por:

```text
Las existencias no pueden quedar debajo de lo apartado. Cada movimiento guarda dos cambios: `deltaOnHand` (existencias) y `deltaReserved` (apartado en pedidos).
```

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: sin errores; todas las pruebas pasan (database, storage, shared-utils e inttimo).

- [ ] **Step 7: Commit**

```bash
git add apps/inttimo/src/lib/store apps/inttimo/src/components/store/admin/AdminProducts.tsx docs/store/BACKEND-REQUEST.md
git commit -m "feat(inttimo): split stock movement delta into on-hand and reserved

The store admin contract now carries deltaOnHand and deltaReserved so a
reservation can be told apart from a reception. Updates the mock and the
movements list accordingly."
```

---

## Self-review

- **Cobertura del diseño** (`subproyecto-1-diseno.md`): tablas (Task 1); manejo del stock puntos 1 a 4 y 6 (Tasks 3 y 4) y punto 5, cancelar o reembolsar, queda para el subproyecto 5 como dice el diseño; productos, inventario, ajuste y movimientos (Task 2); apartado con bloqueo en orden fijo, idempotencia y varias líneas (Task 3); webhook idempotente, vencimiento con gracia, pago tardío con y sin stock (Task 4); `store:seed` sin precio y `BACKEND-PLAN.md` (Task 5); ajuste del contrato `StockMovement` (Task 6); pruebas listadas en el diseño: apartar, vender y liberar, vencimiento, idempotencia, webhook repetido, pago tardío, límites del ajuste, ledger = existencias, historiales, RLS.
- **Interpretaciones del diseño a revisar:** "buscar pedidos" se implementó como búsquedas por clave (`findStoreOrderById/Number/SessionId`); la lista y búsqueda para el panel es del subproyecto 5. El diseño dice "se libera también al calcular lo disponible": `createStoreOrder` libera antes de apartar y exporta `releaseExpiredStoreOrders` para que el catálogo y el carrito (subproyecto 2) lo llamen antes de leer disponibilidad. `store_orders` no lleva columna de cupón: `discountAmount` queda en 0 hasta decidir cupones.
- **Nombres consistentes entre tareas:** `upsertStoreProduct`, `adjustStock`, `StockAdjustmentReason`, `createStoreOrder` (devuelve `{ order, items, reused }`), `attachStoreCheckoutSession`, `markStoreOrderPaid` (`outcome`), `markStoreOrderPaymentFailed` y `markStoreCheckoutCreateFailed` (`changed`), `releaseExpiredStoreOrders`, `STORE_HOLD_GRACE_MINUTES`, helpers `seedProduct` / `pickupOrder` / `inventoryOf` / `expectLedgerMatches`.
