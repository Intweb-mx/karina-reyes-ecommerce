# Tienda inttimo — PR A "Vender": plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the store's public purchase flow real (catalog, product, cart quote, delivery options, shipping quote, postal code, checkout with Stripe, order confirmation), plus the store branch of the Stripe webhook, order emails and `pnpm store:reconcile`, implementing exactly what `apps/inttimo/src/lib/store/http.ts` calls without changing the frontend.

**Architecture:** Thin Next.js route handlers under `apps/inttimo/src/app/api/tienda/**` call services in `apps/inttimo/src/server/store/` (mirroring `server/presale`). Data access lives in `packages/database/src/store.ts` (Drizzle, PostgreSQL). Stripe stays behind `server/presale/gateway.ts`; SkyDropX behind `server/shipping/skydropx.ts`. The existing `/api/webhooks/stripe` routes store sessions by `metadata.kind = "store"`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod 4, Drizzle ORM 0.45 + drizzle-kit 0.31, PostgreSQL (Supabase; PGlite in tests), Stripe SDK 22, Vitest 5, pnpm.

**Spec:** [docs/store/vender-diseno.md](./vender-diseno.md)

## Global Constraints

- Branch `feat/tienda-vender`. Never push. Never run migrations, seeds or reconcile against a remote or production database; never use port 54322.
- `apps/inttimo/src/lib/store/{contract.ts,mock.ts,http.ts,api.ts,flags.ts}` and all store pages/components stay unchanged.
- Only `apps/inttimo/src/server/presale/gateway.ts` imports the Stripe SDK in app code (scripts may construct `new Stripe(key)` as `presale-reconcile.ts` already does).
- Only `apps/inttimo/src/server/shipping/skydropx.ts` talks to SkyDropX; store code uses the `ShippingProvider` interface.
- Money is integer centavos; currency comes from `store_products.currency` / `store_orders.currency` (`"mxn"`); the browser never sends prices.
- `STORE_TERMS_VERSION = 1` (`apps/inttimo/src/server/store/terms.ts`).
- Stripe Checkout session for the store: 31 minutes (`STORE_CHECKOUT_TTL_MINUTES = 31`); hold grace stays `STORE_HOLD_GRACE_MINUTES = 5`.
- Release limits: hot path `STORE_CHECKOUT_RELEASE_LIMIT = 10`; checkout retry 100; `store:reconcile` 1000.
- Shipping quote TTL 120 minutes; quote rate limit 20 per 600 s per IP (`store:quote:<hash>`); checkout rate limits 10 per 600 s per IP (`store:checkout:ip:<hash>`) and 5 per 600 s per email (`store:checkout:email:<hash>`).
- Migration name `0012_store_sell`; every new table gets `ENABLE ROW LEVEL SECURITY` plus `REVOKE ALL` from `anon`/`authenticated`.
- Store sessions: `metadata = { kind: "store", orderId, orderNumber, deliveryMethod }`, `client_reference_id = orderId`, Stripe idempotency key `store-checkout-<orderId>`, `success_url = <site>/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = <site>/checkout?pago=cancelado`.
- Error bodies use only the contract's `StoreErrorCode`s: `validation_error | not_found | out_of_stock | rate_limited | quote_expired | service_unavailable | terms_outdated`.
- `fieldErrors` keys in checkout responses: `fullName`, `email`, `phone`, `deliveryMethod`, `pickupPointId`, `address.<field>`, `shipping`, `acceptTerms`, `lines`, `couponCode`.
- Inside `apps/inttimo/src/server/store/` use relative imports with the `.ts` extension (scripts run with `node --experimental-strip-types`); route handlers may use `@/…`.
- App tests use `T0 = new Date()` (real clock), never a fixed date: `created_at` is set by the database with `now()`.
- Before writing route handlers read `apps/inttimo/node_modules/next/dist/docs/01-app` (route handlers) per `apps/inttimo/AGENTS.md`, and follow the existing `app/api/preventa/**` pattern (`RouteContext<"…">`).
- User-facing copy in Spanish; email copy carries the comment `COPIA PENDIENTE DE APROBACIÓN DE KARINA`.
- Presale tests must stay green: `pnpm --filter @inttimo/database test` and `cd apps/inttimo && npx vitest run`.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Task 1: Store settings, shipping quotes and confirmation column (migration 0012)

**Files:**
- Modify: `packages/database/src/schema/store.ts`
- Create (generated): `packages/database/migrations/0012_store_sell.sql`, `packages/database/migrations/meta/0012_snapshot.json`, `packages/database/migrations/meta/_journal.json` (updated)
- Modify: `packages/database/src/store.ts`
- Modify: `apps/inttimo/scripts/store-seed.ts`
- Test: `packages/database/tests/store-settings.test.ts`

**Interfaces:**
- Consumes: `PickupPoint`, `ShippingProfile` (`packages/database/src/schema/presale.ts`); `Executor` (`packages/database/src/presale.ts`).
- Produces:
  - `storeSettings`, `storeShippingQuotes` tables; `storeOrders.confirmationEmailSentAt: Date | null`; `type StoreQuoteLine = { productId: string; quantity: number }`; `type StoreQuoteOption = { id: string; rateId: string; carrier: string; service: string; days: number | null; amount: number }`
  - `type StoreSettings`, `type StoreSettingsInput = Pick<…, "pickupEnabled" | "pickupPoints" | "shippingEnabled" | "shippingProfile">`
  - `getStoreSettings(db: Executor): Promise<StoreSettings | null>`
  - `saveStoreSettings(db: Executor, input: StoreSettingsInput, options?: { overwrite?: boolean }): Promise<StoreSettings>`
  - `type StoreShippingQuote`; `saveStoreShippingQuote(db: Executor, input: typeof storeShippingQuotes.$inferInsert): Promise<StoreShippingQuote>`; `getStoreShippingQuote(db: Executor, id: string): Promise<StoreShippingQuote | null>`

- [ ] **Step 1: Write the failing test**

Create `packages/database/tests/store-settings.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { createStoreOrder, getStoreSettings, getStoreShippingQuote, saveStoreSettings, saveStoreShippingQuote } from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const POINTS = [{ id: "costco", name: "Punto de prueba", schedule: "Horario de prueba" }];
/** Datos de prueba (no son los reales de inttimo). */
const PROFILE = {
  origin: { name: "Origen Prueba", company: null, street: "Calle 1", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", phone: "6140000000", email: "origen@prueba.test", reference: null },
  parcel: { weightKg: 1, lengthCm: 16, widthCm: 11, heightCm: 11 },
  carriers: [] as string[],
  consignmentNote: "00000000",
  packageType: "box",
};

describe("configuración de entrega de la tienda", () => {
  it("no existe hasta que se guarda", async () => {
    expect(await getStoreSettings(db)).toBeNull();
  });

  it("sin overwrite no pisa lo configurado; con overwrite lo reemplaza", async () => {
    const first = await saveStoreSettings(db, { pickupEnabled: true, pickupPoints: POINTS, shippingEnabled: false, shippingProfile: null });
    expect(first).toMatchObject({ id: "default", pickupEnabled: true, pickupPoints: POINTS, shippingEnabled: false, shippingProfile: null });

    const kept = await saveStoreSettings(db, { pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE });
    expect(kept).toMatchObject({ pickupEnabled: true, shippingEnabled: false });

    const replaced = await saveStoreSettings(db, { pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE }, { overwrite: true });
    expect(replaced).toMatchObject({ pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE });
  });

  it("solo existe una fila", async () => {
    await expect(db.execute(sql`insert into store_settings (id) values ('otra')`)).rejects.toThrow();
  });
});

describe("cotizaciones de envío de la tienda", () => {
  it("guarda y lee; un id que no es UUID no existe", async () => {
    const quote = await saveStoreShippingQuote(db, {
      lines: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
      postalCode: "06600",
      quotationId: "quo_1",
      currency: "mxn",
      options: [{ id: "economico", rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, amount: 18_000 }],
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await getStoreShippingQuote(db, quote.id)).toMatchObject({ postalCode: "06600", currency: "mxn", lines: [{ quantity: 2 }], options: [{ rateId: "rate_eco", amount: 18_000 }] });
    expect(await getStoreShippingQuote(db, "no-es-uuid")).toBeNull();
  });
});

describe("pedidos", () => {
  it("nacen sin correo de confirmación enviado", async () => {
    const product = await seedProduct(db);
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    expect(order.confirmationEmailSentAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-settings.test.ts`
Expected: FAIL — `getStoreSettings is not a function` (the exports do not exist yet) and `confirmationEmailSentAt` is `undefined`.

- [ ] **Step 3: Add the schema**

In `packages/database/src/schema/store.ts` change the type import on line 4 to:

```ts
import type { DeliveryAddress, PickupPoint, ShippingProfile, ShippingSelection } from "./presale.ts";
```

In `storeOrders`, right after the `paidAt` column add:

```ts
    /** Reserva idempotente del correo de pedido pagado (cliente o, si es excepción, solo aviso al equipo). */
    confirmationEmailSentAt: timestamp({ withTimezone: true }),
```

Append at the end of the file:

```ts
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
```

- [ ] **Step 4: Generate the migration and append RLS by hand**

Run: `pnpm --filter @inttimo/database db:generate --name store_sell`
Expected: creates `packages/database/migrations/0012_store_sell.sql` with `CREATE TABLE "store_settings"` (including `CONSTRAINT "store_settings_singleton_check" CHECK ("store_settings"."id" = 'default')`), `CREATE TABLE "store_shipping_quotes"`, `ALTER TABLE "store_orders" ADD COLUMN "confirmation_email_sent_at" timestamp with time zone;` and `CREATE INDEX "store_shipping_quotes_created_idx"`, plus `meta/0012_snapshot.json` and a new `_journal.json` entry. If it lists any other change, stop and investigate (the schema and snapshots must already be in sync).

Append to the end of `packages/database/migrations/0012_store_sell.sql`:

```sql
--> statement-breakpoint
-- Tablas nuevas: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "store_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store_shipping_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  role_name text;
BEGIN
  -- Los roles solo existen en Supabase (no en PGlite de pruebas).
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "store_settings", "store_shipping_quotes" FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
```

- [ ] **Step 5: Add the data functions**

In `packages/database/src/store.ts` change the schema import (line 6) to:

```ts
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
```

Append at the end of the file:

```ts
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
```

- [ ] **Step 6: Seed the delivery settings from the presale campaign file**

Replace the whole content of `apps/inttimo/scripts/store-seed.ts` with:

```ts
/**
 * Carga el catálogo inicial de la tienda (hoy solo UNO+UNO) y la configuración de entrega.
 *
 *   pnpm store:seed                  # escribe en la base de DATABASE_URL (la local por defecto)
 *   pnpm store:seed --allow-remote   # obligatorio si DATABASE_URL no es localhost (producción)
 *
 * - UNO+UNO: sin precio, como "próximamente" y con 0 existencias. Si ya existe no cambia nada (no pisa el precio ni las
 *   existencias fijadas desde el panel). Peso y medidas salen del paquete de la preventa.
 * - Entrega (`store_settings`): se COPIA de docs/preventa/uno-mas-uno.json (puntos de recolección, envío, origen, paquete,
 *   paqueterías, carta porte). Nada inventado. Si ya existe no se pisa.
 */
import { readFile } from "node:fs/promises";
import { createDatabase, getStoreProductBySlug, getStoreSettings, saveStoreSettings, upsertStoreProduct, type PickupPoint, type ShippingProfile } from "@inttimo/database";
import { fail, flag } from "./cli.ts";

const url = process.env.DATABASE_URL ?? fail("Falta DATABASE_URL.");
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  fail("DATABASE_URL no es una URL válida.");
}
if (parsed.port === "54322") fail("DATABASE_URL apunta al puerto 54322 (la base de otro proyecto): no se usa.");
const host = parsed.hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !flag("allow-remote")) {
  fail(`DATABASE_URL apunta a ${host}, no a una base local. Si de verdad es la base real, repite con --allow-remote.`);
}
console.log(`Base: ${host}`);

const db = createDatabase(url);
const SLUG = "uno-mas-uno";

const campaign = JSON.parse(await readFile(new URL("../../../docs/preventa/uno-mas-uno.json", import.meta.url), "utf8")) as {
  pickupEnabled?: boolean;
  pickupPoints?: PickupPoint[];
  shippingEnabled?: boolean;
  shippingProfile?: ShippingProfile | null;
};

if (await getStoreProductBySlug(db, SLUG)) {
  console.log(`  ${SLUG}: ya existe, sin cambios.`);
} else {
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
}

if (await getStoreSettings(db)) {
  console.log("  entrega: ya configurada, sin cambios.");
} else {
  const settings = await saveStoreSettings(db, {
    pickupEnabled: campaign.pickupEnabled ?? false,
    pickupPoints: campaign.pickupPoints ?? [],
    shippingEnabled: campaign.shippingEnabled ?? false,
    shippingProfile: campaign.shippingProfile ?? null,
  });
  console.log(`  entrega: copiada de la preventa (recolección ${settings.pickupEnabled ? "sí" : "no"}, ${settings.pickupPoints.length} puntos; envío ${settings.shippingEnabled ? "sí" : "no"}).`);
}
process.exit(0);
```

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-settings.test.ts`
Expected: PASS (5 tests).

Run: `pnpm --filter @inttimo/database exec vitest run tests/presale.test.ts`
Expected: PASS, including "todas las tablas de public tienen RLS activo".

Run: `pnpm --filter @inttimo/database test && pnpm --filter @inttimo/database typecheck && pnpm --filter inttimo typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/schema/store.ts packages/database/src/store.ts packages/database/migrations packages/database/tests/store-settings.test.ts apps/inttimo/scripts/store-seed.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store delivery settings, shipping quotes and confirmation column

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Read-only availability and hardened release of expired holds

**Files:**
- Modify: `packages/database/src/store.ts`
- Test: `packages/database/tests/store-availability.test.ts`

**Interfaces:**
- Consumes: `closePendingOrder`, `createStoreOrder`, `STORE_HOLD_GRACE_MINUTES` (same file).
- Produces:
  - `STORE_CHECKOUT_RELEASE_LIMIT = 10`
  - `getExpiredHeldUnits(db: Executor, productIds: string[], now?: Date): Promise<Map<string, number>>`
  - `releaseExpiredStoreOrders(db: Database, now?: Date, options?: { limit?: number; source?: EventSource }): Promise<number>` (default limit 100, source `"api"`; oldest expiry first; skips `fulfillment_status = 'exception'`; per-order `try/catch`)
  - `createStoreOrder` releases at most 10 and never fails because of a release error.

- [ ] **Step 1: Write the failing test**

Create `packages/database/tests/store-availability.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-availability.test.ts`
Expected: FAIL — `getExpiredHeldUnits is not a function`; the limit test releases 3 instead of 2; the exception test releases 1; the last test rejects with `liberación rota`.

- [ ] **Step 3: Implement**

In `packages/database/src/store.ts`:

1. Change the drizzle import (line 2) to:

```ts
import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
```

2. In `createStoreOrder`, replace the first two lines of the body:

```ts
  // Libera lo que ya venció antes de contar lo disponible (transacciones separadas; siempre idempotente).
  await releaseExpiredStoreOrders(db, now);
```

with:

```ts
  // Libera lo vencido antes de contar lo disponible: pocos pedidos, del que venció antes al más reciente. Un error de
  // liberación nunca aborta la compra (la liberación en bloque la hacen el reintento del checkout y `store:reconcile`).
  try {
    await releaseExpiredStoreOrders(db, now, { limit: STORE_CHECKOUT_RELEASE_LIMIT });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_release_before_order_failed", error: String(error).slice(0, 300) }));
  }
```

3. Right after `export const STORE_HOLD_GRACE_MINUTES = 5;` add:

```ts
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
 * Unidades apartadas por pedidos ya vencidos que aún no se liberan, por producto. Solo lee: catálogo y carrito suman
 * esto a `existencias − apartado` en vez de liberar en cada consulta.
 */
export async function getExpiredHeldUnits(db: Executor, productIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await db
    .select({ productId: storeOrderItems.productId, units: sql<number>`sum(${storeOrderItems.quantity})::int` })
    .from(storeOrderItems)
    .innerJoin(storeOrders, eq(storeOrders.id, storeOrderItems.orderId))
    .where(and(inArray(storeOrderItems.productId, productIds), expiredHoldWhere(holdCutoff(now))))
    .groupBy(storeOrderItems.productId);
  return new Map(rows.map((row) => [row.productId, Number(row.units)]));
}
```

4. In `closePendingOrder`, replace `return db.transaction(async (tx) => {` (the first line of its body) with:

```ts
  // Pre-chequeo sin bloqueo: un pedido que ya no está pendiente no toma candados de inventario.
  const current = await findStoreOrderById(db, orderId);
  if (!current) return null;
  if (current.paymentStatus !== "pending") return { order: current, changed: false };
  return db.transaction(async (tx) => {
```

5. Replace the whole `releaseExpiredStoreOrders` function (and its doc comment) with:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-availability.test.ts`
Expected: PASS (6 tests).

Run: `pnpm --filter @inttimo/database test && pnpm --filter @inttimo/database typecheck`
Expected: PASS (existing `store-payments.test.ts` release tests included).

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/store.ts packages/database/tests/store-availability.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): read-only store availability and hardened hold release

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Payment lifecycle functions (expiry, amount mismatch, refunds, lookups, email claim)

**Files:**
- Modify: `packages/database/src/store.ts`
- Test: `packages/database/tests/store-lifecycle.test.ts`

**Interfaces:**
- Consumes: `closePendingOrder`, `addStoreOrderEvent`, `findStoreOrderById` (same file).
- Produces:
  - `markStoreCheckoutExpired(db: Database, orderId: string, ctx: { source: EventSource }): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `markStoreOrderPaymentMismatch(db: Database, orderId: string, details: { paymentIntentId: string | null; expected: { amount: number; currency: string }; received: { amount: number | null; currency: string | null } }, ctx: { source: EventSource; externalRef?: string | null }): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `applyStoreRefund(db: Database, orderId: string, amountRefunded: number, ctx: { source: EventSource; externalRef?: string | null }): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `findStoreOrderByPaymentIntent(db: Executor, paymentIntentId: string): Promise<StoreOrder | null>`
  - `findStoreOrderByIdempotencyKey(db: Executor, key: string): Promise<StoreOrder | null>`
  - `claimStoreConfirmationEmail(db: Executor, orderId: string): Promise<StoreOrder | null>`; `releaseStoreConfirmationEmail(db: Executor, orderId: string): Promise<void>`
  - `listStorePaidWithoutConfirmation(db: Executor): Promise<StoreOrder[]>`; `listUnsettledStoreOrders(db: Executor, olderThan: Date): Promise<StoreOrder[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/database/tests/store-lifecycle.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  applyStoreRefund,
  attachStoreCheckoutSession,
  claimStoreConfirmationEmail,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  findStoreOrderByPaymentIntent,
  listStoreOrderEvents,
  listStorePaidWithoutConfirmation,
  listUnsettledStoreOrders,
  markStoreCheckoutExpired,
  markStoreOrderPaid,
  markStoreOrderPaymentMismatch,
  releaseExpiredStoreOrders,
  releaseStoreConfirmationEmail,
  type StoreOrder,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { inventoryOf, pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  productId = (await seedProduct(db, { stock: 5 })).id;
});

afterEach(() => close());

const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const stripe = { source: "stripe" as const, externalRef: "evt_1" };

/** Pedido de `quantity` × $500 con sesión vigente 30 min. */
async function placeWithSession(quantity = 2, idempotencyKey: string | null = null): Promise<StoreOrder> {
  const { order } = await createStoreOrder(db, pickupOrder([{ productId, quantity }], { idempotencyKey }), T0);
  return (await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutes(30) }))!;
}

const pay = async (order: StoreOrder) => (await markStoreOrderPaid(db, order.id, { paymentIntentId: "pi_1" }, stripe))!.order;

describe("sesión vencida en Stripe", () => {
  it("cancela y libera una sola vez", async () => {
    const order = await placeWithSession();
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: true, order: { paymentStatus: "cancelled", inventoryReserved: false } });
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: false });
    expect(await inventoryOf(db, productId)).toMatchObject({ onHand: 5, reserved: 0 });
    expect((await listStoreOrderEvents(db, order.id)).map((event) => [event.type, event.source])).toContainEqual(["CHECKOUT_EXPIRED", "stripe"]);
  });

  it("no toca un pedido pagado", async () => {
    const order = await pay(await placeWithSession());
    expect(await markStoreCheckoutExpired(db, order.id, { source: "stripe" })).toMatchObject({ changed: false, order: { paymentStatus: "paid" } });
  });
});

describe("Stripe cobró un monto distinto", () => {
  const details = { paymentIntentId: "pi_x", expected: { amount: 100_000, currency: "mxn" }, received: { amount: 1, currency: "mxn" } };

  it("no marca pagado: queda pendiente como excepción, conserva el apartado y la liberación automática no lo toca", async () => {
    const order = await placeWithSession();
    expect(await markStoreOrderPaymentMismatch(db, order.id, details, stripe)).toMatchObject({
      changed: true,
      order: { paymentStatus: "pending", fulfillmentStatus: "exception", stripePaymentIntentId: "pi_x", inventoryReserved: true },
    });
    expect(await markStoreOrderPaymentMismatch(db, order.id, details, stripe)).toMatchObject({ changed: false });

    const exceptions = (await listStoreOrderEvents(db, order.id)).filter((event) => event.type === "EXCEPTION");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]!.metadata).toMatchObject({ reason: "amount_mismatch", expected: { amount: 100_000 }, received: { amount: 1 } });

    expect(await releaseExpiredStoreOrders(db, minutes(120))).toBe(0);
    expect(await inventoryOf(db, productId)).toMatchObject({ reserved: 2 });
  });

  it("devuelve null si el pedido no existe", async () => {
    expect(await markStoreOrderPaymentMismatch(db, randomUUID(), details, stripe)).toBeNull();
  });
});

describe("reembolsos informados por Stripe", () => {
  it("parcial y luego total; el acumulado nunca baja y el stock no se toca", async () => {
    const order = await pay(await placeWithSession());
    expect(await applyStoreRefund(db, order.id, 30_000, stripe)).toMatchObject({ changed: true, order: { paymentStatus: "partially_refunded", amountRefunded: 30_000 } });
    expect(await applyStoreRefund(db, order.id, 10_000, stripe)).toMatchObject({ changed: false, order: { amountRefunded: 30_000 } });
    expect(await applyStoreRefund(db, order.id, 100_000, stripe)).toMatchObject({ changed: true, order: { paymentStatus: "refunded", amountRefunded: 100_000 } });

    const types = (await listStoreOrderEvents(db, order.id)).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["PARTIALLY_REFUNDED", "REFUNDED"]));
    expect(await inventoryOf(db, productId)).toMatchObject({ onHand: 3, reserved: 0 });
  });

  it("ignora pedidos sin pagar", async () => {
    const order = await placeWithSession();
    expect(await applyStoreRefund(db, order.id, 10_000, stripe)).toMatchObject({ changed: false, order: { paymentStatus: "pending", amountRefunded: 0 } });
  });
});

describe("búsquedas", () => {
  it("por payment intent y por clave de idempotencia", async () => {
    const order = await pay(await placeWithSession(1, "clave-123456"));
    expect((await findStoreOrderByPaymentIntent(db, "pi_1"))?.id).toBe(order.id);
    expect(await findStoreOrderByPaymentIntent(db, "pi_otro")).toBeNull();
    expect((await findStoreOrderByIdempotencyKey(db, "clave-123456"))?.id).toBe(order.id);
    expect(await findStoreOrderByIdempotencyKey(db, "otra-clave")).toBeNull();
  });

  it("sin resolver: pendientes con sesión creados antes del corte", async () => {
    const withSession = await placeWithSession(1);
    await createStoreOrder(db, pickupOrder([{ productId, quantity: 1 }]), T0);
    await pay(await placeWithSession(1));

    expect((await listUnsettledStoreOrders(db, new Date(Date.now() + 60_000))).map((order) => order.id)).toEqual([withSession.id]);
    expect(await listUnsettledStoreOrders(db, new Date(Date.now() - 60_000))).toEqual([]);
  });
});

describe("correo de confirmación", () => {
  it("solo se reserva para pedidos pagados, una vez, y se puede liberar para reintentar", async () => {
    const order = await placeWithSession(1);
    expect(await claimStoreConfirmationEmail(db, order.id)).toBeNull();

    await pay(order);
    expect(await listStorePaidWithoutConfirmation(db)).toHaveLength(1);
    expect((await claimStoreConfirmationEmail(db, order.id))?.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect(await claimStoreConfirmationEmail(db, order.id)).toBeNull();
    expect(await listStorePaidWithoutConfirmation(db)).toEqual([]);

    await releaseStoreConfirmationEmail(db, order.id);
    expect((await claimStoreConfirmationEmail(db, order.id))?.id).toBe(order.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-lifecycle.test.ts`
Expected: FAIL — `markStoreCheckoutExpired is not a function` (and the other new functions).

- [ ] **Step 3: Implement**

In `packages/database/src/store.ts`, after `findStoreOrderBySessionId` add:

```ts
export async function findStoreOrderByPaymentIntent(db: Executor, paymentIntentId: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.stripePaymentIntentId, paymentIntentId)).limit(1);
  return row ?? null;
}

export async function findStoreOrderByIdempotencyKey(db: Executor, key: string): Promise<StoreOrder | null> {
  const [row] = await db.select().from(storeOrders).where(eq(storeOrders.idempotencyKey, key)).limit(1);
  return row ?? null;
}
```

After `markStoreCheckoutCreateFailed` add:

```ts
/** Stripe venció la sesión sin pago: el pedido queda cancelado y se libera el apartado (una sola vez). */
export function markStoreCheckoutExpired(db: Database, orderId: string, ctx: { source: EventSource }) {
  return closePendingOrder(db, orderId, { paymentStatus: "cancelled", event: "CHECKOUT_EXPIRED", source: ctx.source });
}

/**
 * Stripe informa un pago con monto o moneda distintos al pedido. No se marca pagado: queda pendiente como excepción, con
 * su apartado (la liberación automática ignora excepciones) y el payment intent guardado, para que una persona lo revise.
 * Idempotente.
 */
export async function markStoreOrderPaymentMismatch(
  db: Database,
  orderId: string,
  details: { paymentIntentId: string | null; expected: { amount: number; currency: string }; received: { amount: number | null; currency: string | null } },
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<{ order: StoreOrder; changed: boolean } | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(storeOrders).where(eq(storeOrders.id, orderId)).for("update");
    if (!order) return null;
    if (order.paymentStatus !== "pending" || order.fulfillmentStatus === "exception") return { order, changed: false };
    const [updated] = await tx
      .update(storeOrders)
      .set({ fulfillmentStatus: "exception", stripePaymentIntentId: details.paymentIntentId ?? order.stripePaymentIntentId })
      .where(eq(storeOrders.id, orderId))
      .returning();
    await addStoreOrderEvent(tx, orderId, "EXCEPTION", ctx.source, {
      externalRef: ctx.externalRef ?? null,
      metadata: { reason: "amount_mismatch", expected: details.expected, received: details.received },
    });
    return { order: updated!, changed: true };
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
    .where(and(eq(storeOrders.paymentStatus, "pending"), sql`${storeOrders.stripeCheckoutSessionId} is not null`, lt(storeOrders.createdAt, olderThan)))
    .orderBy(asc(storeOrders.createdAt), asc(storeOrders.id));
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @inttimo/database exec vitest run tests/store-lifecycle.test.ts`
Expected: PASS (9 tests).

Run: `pnpm --filter @inttimo/database test && pnpm --filter @inttimo/database typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/store.ts packages/database/tests/store-lifecycle.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store payment lifecycle, refunds and confirmation email claim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Task 4: Store service scaffolding, product content, catalog, product detail and cart quote

**Files:**
- Create: `apps/inttimo/src/server/store/common.ts`
- Create: `apps/inttimo/src/server/store/lines.ts`
- Create: `apps/inttimo/src/server/store/http.ts`
- Create: `apps/inttimo/src/server/store/runtime.ts`
- Modify: `apps/inttimo/src/server/presale/runtime.ts`
- Create: `apps/inttimo/src/content/store-products.ts`
- Create: `apps/inttimo/src/server/store/catalog.ts`
- Create: `apps/inttimo/src/app/api/tienda/productos/route.ts`
- Create: `apps/inttimo/src/app/api/tienda/productos/[slug]/route.ts`
- Create: `apps/inttimo/src/app/api/tienda/carrito/cotizar/route.ts`
- Create: `apps/inttimo/tests/store-helpers.ts`
- Test: `apps/inttimo/tests/store-catalog.test.ts`

**Interfaces:**
- Consumes: `listStoreProducts`, `getExpiredHeldUnits`, `getStoreProductById`, `upsertStoreProduct`, `adjustStock`, `saveStoreSettings`, `type StoreSettingsInput`, `type NewStoreOrder` (`@inttimo/database`); `getProductContent` (`src/content/products.ts`); `faqs` (`src/content/store.ts`); `storeEnabled` (`src/lib/store/flags.ts`); contract types (`src/lib/store/contract.ts`).
- Produces:
  - `common.ts`: `type StoreDeps = { db: Database; gateway: PaymentGateway; shipping: ShippingProvider | null; siteUrl: string; now?: () => Date; onPaid?: (orderId: string) => Promise<unknown> }`; `type StoreResult<T>`; `ok<T>(data: T, status?: number): StoreResult<T>`; `fail(status: number, code: StoreErrorCode, message: string, fieldErrors?: Record<string, string[]>): StoreResult<never>`; `zodFieldErrors(error: ZodError, keyOf?: (path: PropertyKey[]) => string): Record<string, string[]>`; `hash(value: string): string`; `isUniqueViolation(error: unknown): boolean`
  - `lines.ts`: `lineSchema`, `MAX_CART_LINES = 50`, `cartLinesSchema`, `normalizeLines(lines: CartLine[]): CartLine[]`, `sameLines(a: CartLine[], b: CartLine[]): boolean`
  - `http.ts`: `storeResponse<T>(result: StoreResult<T>): Response`; `readJson(request: Request, maxBytes: number): Promise<unknown>`; `storeRoute(name: string, run: () => Promise<Response>, enabled?: boolean): Promise<Response>`
  - `runtime.ts`: `getStoreDeps(): StoreDeps`; re-export `clientIp`
  - `presale/runtime.ts`: `getPaymentGateway(): PaymentGateway`
  - `content/store-products.ts`: `type StoreProductContent`; `getStoreProductContent(slug: string): StoreProductContent | null`
  - `catalog.ts`: `type ForSale`; `loadForSale(db: Database, now: Date): Promise<ForSale[]>`; `isPurchasable(product): boolean`; `productStatus(product): ProductStatus`; `toSummary(product: ForSale): ProductSummary`; `getCatalog(deps: Pick<StoreDeps, "db" | "now">): Promise<StoreResult<CatalogResponse>>`; `getProduct(deps, slug: string): Promise<StoreResult<ProductDetail>>`; `quoteCart(deps, body: unknown): Promise<StoreResult<CartQuoteResponse>>`
  - `tests/store-helpers.ts`: `T0`, `UNO`, `AREA`, `SHIP_ADDRESS`, `seedStoreProduct`, `seedStoreSettings`, `inventoryOf`, `pickupOrderFor`, `minutesAfter`

- [ ] **Step 1: Write the test helpers and the failing test**

Create `apps/inttimo/tests/store-helpers.ts`:

```ts
import {
  adjustStock,
  getStoreProductById,
  saveStoreSettings,
  upsertStoreProduct,
  type Database,
  type NewStoreOrder,
  type NewStoreProduct,
  type StoreProduct,
  type StoreSettingsInput,
} from "@inttimo/database";
import { ADDRESS, PICKUP_POINTS, SHIPPING_PROFILE } from "./helpers.ts";

/** Reloj real: `created_at` lo pone la base con now(), así que las pruebas de la tienda no usan una fecha fija. */
export const T0 = new Date();
export const minutesAfter = (n: number) => new Date(T0.getTime() + n * 60_000);

export const UNO = "uno-mas-uno";
export const AREA = { postalCode: ADDRESS.postalCode, state: ADDRESS.state, city: ADDRESS.city, neighborhood: ADDRESS.neighborhood };
export const SHIP_ADDRESS = { ...ADDRESS, name: "Ana Pérez", phone: "6141234567" };

/** UNO+UNO a la venta con datos de PRUEBA (precio y existencias no son los reales). */
export async function seedStoreProduct(db: Database, options: { stock?: number } & Partial<NewStoreProduct> = {}): Promise<StoreProduct> {
  const { stock = 20, ...overrides } = options;
  const product = await upsertStoreProduct(db, {
    slug: UNO,
    name: "UNO+UNO",
    published: true,
    saleStatus: "on_sale",
    price: 50_000,
    weightGrams: 1000,
    lengthCm: 16,
    widthCm: 11,
    heightCm: 11,
    territories: ["conversacion", "conexion"],
    ...overrides,
  });
  if (stock > 0) await adjustStock(db, { productId: product.id, delta: stock, reason: "reception", actor: "test" });
  return product;
}

export function seedStoreSettings(db: Database, overrides: Partial<StoreSettingsInput> = {}) {
  return saveStoreSettings(db, { pickupEnabled: true, pickupPoints: PICKUP_POINTS, shippingEnabled: true, shippingProfile: SHIPPING_PROFILE, ...overrides }, { overwrite: true });
}

export async function inventoryOf(db: Database, productId: string) {
  const product = (await getStoreProductById(db, productId))!;
  return { onHand: product.onHand, reserved: product.reserved };
}

export function pickupOrderFor(productId: string, quantity: number, overrides: Partial<NewStoreOrder> = {}): NewStoreOrder {
  return {
    contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: null },
    lines: [{ productId, quantity }],
    delivery: { method: "pickup", pickupPointId: "costco" },
    shippingAmount: 0,
    termsVersion: 1,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
    ...overrides,
  };
}
```

Create `apps/inttimo/tests/store-catalog.test.ts`:

```ts
import { attachStoreCheckoutSession, createStoreOrder, upsertStoreProduct, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog, getProduct, productStatus, quoteCart } from "../src/server/store/catalog.ts";
import { storeRoute } from "../src/server/store/http.ts";
import { inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, T0, UNO } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
const deps = () => ({ db, now: () => T0 });
const MXN = (amount: number) => ({ amount, currency: "mxn" });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

describe("estado comercial", () => {
  const base = { saleStatus: "on_sale" as const, lowStockThreshold: 5 };
  it.each([
    [{ ...base, saleStatus: "coming_soon" as const, effectiveAvailable: 50 }, "coming_soon"],
    [{ ...base, saleStatus: "presale" as const, effectiveAvailable: 0 }, "presale"],
    [{ ...base, effectiveAvailable: 0 }, "sold_out"],
    [{ ...base, effectiveAvailable: 5 }, "low_stock"],
    [{ ...base, effectiveAvailable: 6 }, "available"],
  ])("%o → %s", (product, expected) => {
    expect(productStatus(product)).toBe(expected);
  });
});

describe("catálogo", () => {
  it("muestra solo publicados con contenido, con precio de la base", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const product = await seedStoreProduct(db);
    await upsertStoreProduct(db, { slug: "sin-contenido", name: "Sin contenido", published: true, saleStatus: "on_sale", price: 10_000 });
    await upsertStoreProduct(db, { slug: "oculto", name: "Oculto", published: false });

    const result = await getCatalog(deps());
    expect(result.ok && result.data.products).toEqual([
      expect.objectContaining({
        id: product.id,
        slug: UNO,
        name: "UNO+UNO",
        type: "physical",
        status: "available",
        price: MXN(50_000),
        compareAtPrice: null,
        availableUnits: null,
        territories: ["conversacion", "conexion"],
        tagline: "Conversaciones que nos acercan.",
      }),
    ]);
  });

  it("con poco inventario dice cuántas quedan", async () => {
    await seedStoreProduct(db, { stock: 3 });
    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "low_stock", availableUnits: 3 });
  });

  it("sin precio aparece como próximamente y sin precio", async () => {
    await seedStoreProduct(db, { price: null, saleStatus: "coming_soon" });
    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "coming_soon", price: null });
  });

  it("cuenta como disponibles los apartados vencidos sin escribir en la base", async () => {
    const product = await seedStoreProduct(db, { stock: 6 });
    const { order } = await createStoreOrder(db, pickupOrderFor(product.id, 4), T0);
    await attachStoreCheckoutSession(db, order.id, { id: `cs_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutesAfter(-60) });

    const result = await getCatalog(deps());
    expect(result.ok && result.data.products[0]).toMatchObject({ status: "available", availableUnits: null });
    expect(await inventoryOf(db, product.id)).toEqual({ onHand: 6, reserved: 4 });
  });
});

describe("detalle de producto", () => {
  it("404 si no existe, está oculto o el slug no es válido", async () => {
    await seedStoreProduct(db, { published: false });
    for (const slug of [UNO, "otro", "../x"]) {
      expect(await getProduct(deps(), slug)).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    }
  });

  it("combina lo comercial de la base con el contenido", async () => {
    await seedStoreProduct(db, { maxQuantityPerOrder: 4 });
    const result = await getProduct(deps(), UNO);
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    expect(result.data).toMatchObject({ slug: UNO, maxQuantityPerOrder: 4, related: [], seo: { title: "UNO+UNO · Conversaciones que nos acercan" } });
    expect(result.data.faqs.map((faq) => faq.id)).toEqual(["envios-mexico", "recoleccion", "devoluciones", "para-quien"]);
    expect(result.data.gallery).toHaveLength(3);
    expect(result.data.gallery.some((image) => image.src.includes("bonus"))).toBe(false);
    expect(result.data.howToPlay).toHaveLength(4);
    expect(result.data.includes.length).toBeGreaterThan(0);
  });
});

describe("cotizar carrito", () => {
  const quote = (body: unknown) => quoteCart(deps(), body);

  it("calcula precios y totales en el servidor y une líneas repetidas", async () => {
    const product = await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }, { productId: product.id.toUpperCase(), quantity: 1 }] });
    expect(result.ok && result.data).toEqual({
      lines: [
        expect.objectContaining({ productId: product.id, slug: UNO, name: "UNO+UNO", unitPrice: MXN(50_000), quantity: 2, subtotal: MXN(100_000), notice: null, available: true, maxQuantity: 10 }),
      ],
      subtotal: MXN(100_000),
      discount: null,
      coupon: null,
      couponError: null,
      total: MXN(100_000),
    });
  });

  it("ajusta al máximo por pedido y lo explica", async () => {
    const product = await seedStoreProduct(db, { maxQuantityPerOrder: 3 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 5 }] });
    expect(result.ok && result.data.lines[0]).toMatchObject({ quantity: 3, maxQuantity: 3, notice: "Máximo 3 por pedido.", subtotal: MXN(150_000) });
  });

  it("ajusta a lo disponible y lo explica", async () => {
    const product = await seedStoreProduct(db, { stock: 2 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 4 }] });
    expect(result.ok && result.data.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2, notice: "Solo quedan 2 unidades; ajustamos la cantidad." });
  });

  it("agotado: línea no disponible y fuera del total", async () => {
    const product = await seedStoreProduct(db, { stock: 0 });
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }] });
    expect(result.ok && result.data).toMatchObject({ lines: [{ available: false, notice: "Este producto se agotó.", subtotal: MXN(0) }], total: MXN(0) });
  });

  it("sin precio: línea no disponible", async () => {
    const product = await seedStoreProduct(db, { price: null });
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }] });
    expect(result.ok && result.data).toMatchObject({ lines: [{ available: false, notice: "Este producto todavía no está a la venta." }], total: MXN(0) });
  });

  it("omite ids desconocidos (p. ej. del simulador)", async () => {
    await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: "prod_uno_mas_uno", quantity: 1 }] });
    expect(result.ok && result.data.lines).toEqual([]);
  });

  it("no hay cupones: cualquier código es inválido y no descuenta", async () => {
    const product = await seedStoreProduct(db);
    const result = await quote({ lines: [{ productId: product.id, quantity: 1 }], couponCode: "VERANO" });
    expect(result.ok && result.data).toMatchObject({ couponError: "Este cupón no es válido.", coupon: null, discount: null, total: MXN(50_000) });
  });

  it("rechaza un cuerpo inválido", async () => {
    expect(await quote({ lines: [{ productId: "x", quantity: 0 }] })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(await quote(null)).toMatchObject({ status: 400 });
  });
});

describe("rutas de la tienda", () => {
  it("con la tienda oculta responden 404", async () => {
    const response = await storeRoute("prueba", async () => Response.json({ ok: true }), false);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("un error inesperado es 503 genérico y queda en el log", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await storeRoute("prueba", async () => {
      throw new Error("base caída");
    }, true);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "service_unavailable" } });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("prueba_failed"));
  });

  it("con la tienda visible pasa la respuesta tal cual", async () => {
    const response = await storeRoute("prueba", async () => Response.json({ ok: true }), true);
    expect(await response.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-catalog.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/catalog.ts` (the module does not exist yet).

- [ ] **Step 3: Implement the shared pieces**

Create `apps/inttimo/src/server/store/common.ts`:

```ts
import { createHash } from "node:crypto";
import type { Database } from "@inttimo/database";
import type { ZodError } from "zod";
import type { StoreError, StoreErrorCode } from "../../lib/store/contract.ts";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { ShippingProvider } from "../shipping/provider.ts";

export type StoreDeps = {
  db: Database;
  gateway: PaymentGateway;
  /** SkyDropX; null = sin credenciales (no se ofrece envío a domicilio). */
  shipping: ShippingProvider | null;
  /** NEXT_PUBLIC_SITE_URL: base de las URLs de regreso de Stripe. */
  siteUrl: string;
  now?: () => Date;
  /** Se llama cuando un pedido queda pagado (correo de confirmación idempotente). */
  onPaid?: (orderId: string) => Promise<unknown>;
};

export type StoreResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; body: StoreError };

export function ok<T>(data: T, status = 200): StoreResult<T> {
  return { ok: true, status, data };
}

export function fail(status: number, code: StoreErrorCode, message: string, fieldErrors?: Record<string, string[]>): StoreResult<never> {
  return { ok: false, status, body: { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } } };
}

const joinPath = (path: PropertyKey[]) => path.map(String).join(".") || "_";

/** Errores de Zod → fieldErrors. `keyOf` traduce la ruta del error a la clave que pinta la pantalla. */
export function zodFieldErrors(error: ZodError, keyOf: (path: PropertyKey[]) => string = joinPath): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[keyOf(issue.path)] ??= []).push(issue.message);
  return result;
}

export const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function isUniqueViolation(error: unknown): boolean {
  for (let current = error as { code?: string; cause?: unknown } | undefined; current; current = current.cause as typeof current) {
    if (current.code === "23505") return true;
  }
  return false;
}
```

Create `apps/inttimo/src/server/store/lines.ts`:

```ts
import { z } from "zod";
import type { CartLine } from "../../lib/store/contract.ts";

export const lineSchema = z.object({
  productId: z.string({ error: "Producto no válido." }).trim().min(1, "Producto no válido.").max(64, "Producto no válido."),
  quantity: z.number({ error: "Cantidad no válida." }).int("Cantidad no válida.").min(1, "Cantidad no válida.").max(1000, "Cantidad no válida."),
});

export const MAX_CART_LINES = 50;

/** Carrito para cotizar envío o pagar: al menos un producto. */
export const cartLinesSchema = z.array(lineSchema).min(1, "Tu carrito está vacío.").max(MAX_CART_LINES, "Demasiados productos en el carrito.");

/** Une líneas del mismo producto (id en minúsculas) y las ordena: así se comparan carrito, cotización y checkout. */
export function normalizeLines(lines: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const productId = line.productId.trim().toLowerCase();
    merged.set(productId, (merged.get(productId) ?? 0) + line.quantity);
  }
  return [...merged]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

export function sameLines(a: CartLine[], b: CartLine[]): boolean {
  const left = normalizeLines(a);
  const right = normalizeLines(b);
  return left.length === right.length && left.every((line, index) => line.productId === right[index]!.productId && line.quantity === right[index]!.quantity);
}
```

Create `apps/inttimo/src/server/store/http.ts`:

```ts
import type { StoreError } from "../../lib/store/contract.ts";
import { storeEnabled } from "../../lib/store/flags.ts";
import type { StoreResult } from "./common.ts";

const NO_STORE = { "cache-control": "no-store" };

export function storeResponse<T>(result: StoreResult<T>): Response {
  return Response.json(result.ok ? result.data : result.body, { status: result.status, headers: NO_STORE });
}

/** JSON del cuerpo; null si excede `maxBytes` o no es JSON (el servicio responde validation_error). */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Envoltura de cada ruta /api/tienda/*. Con la tienda oculta (src/lib/store/flags.ts) responde 404 como si no existiera:
 * nada de la tienda (ni el checkout, que crea pedidos y sesiones de Stripe) es alcanzable en producción antes del
 * lanzamiento. Un error inesperado responde 503 genérico con log estructurado, nunca un falso éxito.
 */
export async function storeRoute(name: string, run: () => Promise<Response>, enabled: boolean = storeEnabled): Promise<Response> {
  if (!enabled) {
    const body: StoreError = { error: { code: "not_found", message: "No encontrado." } };
    return Response.json(body, { status: 404, headers: NO_STORE });
  }
  try {
    return await run();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: `${name}_failed`, error: String(error).slice(0, 500) }));
    const body: StoreError = { error: { code: "service_unavailable", message: "La tienda no está disponible por el momento. Inténtalo de nuevo en unos minutos." } };
    return Response.json(body, { status: 503, headers: NO_STORE });
  }
}
```

In `apps/inttimo/src/server/presale/runtime.ts`, right after the `lazyGateway` constant add:

```ts
/** Pasarela de pago compartida por la preventa y la tienda (Stripe se inicializa al usarse). */
export function getPaymentGateway(): PaymentGateway {
  return lazyGateway;
}
```

Create `apps/inttimo/src/server/store/runtime.ts`:

```ts
import "server-only";
import { getDb, getPaymentGateway, getShippingProvider } from "../presale/runtime.ts";
import type { StoreDeps } from "./common.ts";

export { clientIp } from "../presale/runtime.ts";

/** Dependencias reales de la tienda (misma base, Stripe y SkyDropX que la preventa). */
export function getStoreDeps(): StoreDeps {
  return {
    db: getDb(),
    gateway: getPaymentGateway(),
    shipping: getShippingProvider(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  };
}
```

- [ ] **Step 4: Implement product content and the catalog service**

Create `apps/inttimo/src/content/store-products.ts`:

```ts
/*
 * Contenido editorial de los productos de la TIENDA, por `slug` de store_products. La base guarda solo lo comercial
 * (precio, estado, inventario, máximo por pedido); textos e imágenes viven aquí.
 *
 * ESTADO: PENDIENTE DE APROBACIÓN de Karina.
 * - Textos e imágenes de UNO+UNO salen de content/products.ts (los de la preventa); las fotos son renders de referencia.
 * - "Cómo se juega" se copió del simulador del frontend (src/lib/store/mock.ts): confirmar el texto con Karina.
 * - La imagen del bonus no se usa: el bonus es exclusivo de la preventa.
 * Un producto publicado sin entrada aquí no aparece en el catálogo ni se puede comprar.
 */
import type { Faq, ProductImage } from "../lib/store/contract.ts";
import { getProductContent } from "./products.ts";
import { faqs } from "./store.ts";

export type StoreProductContent = {
  tagline: string;
  image: ProductImage;
  gallery: ProductImage[];
  description: string[];
  includes: string[];
  howToPlay: { title: string; body: string }[];
  faqs: Faq[];
  seo: { title: string; description: string };
};

const uno = getProductContent("uno-mas-uno")!;
const UNO_FAQ_IDS = ["envios-mexico", "recoleccion", "devoluciones", "para-quien"];

const PRODUCTS: Record<string, StoreProductContent> = {
  "uno-mas-uno": {
    tagline: uno.tagline,
    image: { ...uno.thumbnail },
    gallery: [uno.hero, ...(uno.includes ? [uno.includes.image] : []), uno.thumbnail].map((image) => ({ ...image })),
    description: uno.intro,
    includes: uno.includes?.items ?? [],
    howToPlay: [
      { title: "Elijan una categoría", body: "Según el momento y lo que quieran cultivar." },
      { title: "Saquen una tarjeta", body: "Una pregunta a la vez, sin prisa." },
      { title: "Respondan y escuchen", body: "Lo importante pasa en la conversación." },
      { title: "Conecten más allá", body: "Lleven lo que descubran a su vida diaria." },
    ],
    faqs: UNO_FAQ_IDS.flatMap((id) => faqs.filter((faq) => faq.id === id)),
    seo: { title: "UNO+UNO · Conversaciones que nos acercan", description: uno.intro[1] ?? uno.tagline },
  },
};

export function getStoreProductContent(slug: string): StoreProductContent | null {
  return PRODUCTS[slug] ?? null;
}
```

Create `apps/inttimo/src/server/store/catalog.ts`:

```ts
import { getExpiredHeldUnits, listStoreProducts, type Database, type StoreProductWithInventory } from "@inttimo/database";
import { z } from "zod";
import { getStoreProductContent, type StoreProductContent } from "../../content/store-products.ts";
import type { CartQuoteLine, CartQuoteResponse, CatalogResponse, Money, ProductDetail, ProductStatus, ProductSummary, TerritoryId } from "../../lib/store/contract.ts";
import { fail, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { lineSchema, MAX_CART_LINES, normalizeLines } from "./lines.ts";

/** Producto publicado, con contenido y con su disponible efectivo. */
export type ForSale = StoreProductWithInventory & { content: StoreProductContent; effectiveAvailable: number };

const TERRITORIES: readonly TerritoryId[] = ["conversacion", "conexion", "intimidad", "disfrute", "conocimiento", "fe"];
const isTerritory = (value: string): value is TerritoryId => (TERRITORIES as readonly string[]).includes(value);
const money = (amount: number, currency: string): Money => ({ amount, currency });

/**
 * Productos publicados que tienen contenido, con su disponible efectivo: `existencias − apartado + apartados ya vencidos`.
 * Solo lee (no libera nada): la liberación ocurre en el checkout y en `store:reconcile`.
 */
export async function loadForSale(db: Database, now: Date): Promise<ForSale[]> {
  const products = await listStoreProducts(db, { publishedOnly: true });
  const expired = await getExpiredHeldUnits(db, products.map((product) => product.id), now);
  return products.flatMap((product) => {
    const content = getStoreProductContent(product.slug);
    if (!content) {
      console.warn(JSON.stringify({ level: "warn", msg: "store_product_without_content", slug: product.slug }));
      return [];
    }
    return [{ ...product, content, effectiveAvailable: Math.max(0, product.available + (expired.get(product.id) ?? 0)) }];
  });
}

/** Se puede comprar: tiene precio y ya no es "próximamente" (el stock se revisa aparte). */
export function isPurchasable(product: Pick<ForSale, "price" | "saleStatus">): boolean {
  return product.price !== null && product.saleStatus !== "coming_soon";
}

export function productStatus(product: Pick<ForSale, "saleStatus" | "effectiveAvailable" | "lowStockThreshold">): ProductStatus {
  if (product.saleStatus === "coming_soon") return "coming_soon";
  if (product.saleStatus === "presale") return "presale";
  if (product.effectiveAvailable <= 0) return "sold_out";
  if (product.effectiveAvailable <= product.lowStockThreshold) return "low_stock";
  return "available";
}

export function toSummary(product: ForSale): ProductSummary {
  const status = productStatus(product);
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    tagline: product.content.tagline,
    type: product.type,
    status,
    price: product.price === null ? null : money(product.price, product.currency),
    compareAtPrice: product.compareAtPrice === null ? null : money(product.compareAtPrice, product.currency),
    image: product.content.image,
    territories: product.territories.filter(isTerritory),
    availableUnits: status === "low_stock" ? product.effectiveAvailable : null,
  };
}

const nowOf = (deps: Pick<StoreDeps, "now">) => deps.now?.() ?? new Date();

/** GET /api/tienda/productos */
export async function getCatalog(deps: Pick<StoreDeps, "db" | "now">): Promise<StoreResult<CatalogResponse>> {
  const products = await loadForSale(deps.db, nowOf(deps));
  return ok({ products: products.map(toSummary) });
}

/** GET /api/tienda/productos/[slug] — 404 si no existe, no está publicado o no tiene contenido. */
export async function getProduct(deps: Pick<StoreDeps, "db" | "now">, slug: string): Promise<StoreResult<ProductDetail>> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fail(404, "not_found", "Producto no encontrado.");
  const products = await loadForSale(deps.db, nowOf(deps));
  const product = products.find((candidate) => candidate.slug === slug);
  if (!product) return fail(404, "not_found", "Producto no encontrado.");
  const { content } = product;
  return ok({
    ...toSummary(product),
    description: content.description,
    gallery: content.gallery,
    includes: content.includes,
    howToPlay: content.howToPlay,
    faqs: content.faqs,
    maxQuantityPerOrder: product.maxQuantityPerOrder,
    related: products.filter((candidate) => candidate.id !== product.id).slice(0, 3).map(toSummary),
    seo: content.seo,
  });
}

function stockNotice(available: number): string {
  return available === 1 ? "Solo queda 1 unidad; ajustamos la cantidad." : `Solo quedan ${available} unidades; ajustamos la cantidad.`;
}

/** Precio y cantidad de una línea según la base: ajusta al máximo por pedido y a lo disponible, y lo explica. */
export function quoteLine(product: ForSale, requested: number): CartQuoteLine {
  const base = { productId: product.id, slug: product.slug, name: product.name, image: product.content.image, unitPrice: money(product.price ?? 0, product.currency) };
  if (!isPurchasable(product)) {
    return { ...base, quantity: requested, subtotal: money(0, product.currency), notice: "Este producto todavía no está a la venta.", available: false, maxQuantity: requested };
  }
  if (product.effectiveAvailable <= 0) {
    return { ...base, quantity: requested, subtotal: money(0, product.currency), notice: "Este producto se agotó.", available: false, maxQuantity: requested };
  }
  const maxQuantity = Math.min(product.maxQuantityPerOrder, product.effectiveAvailable);
  const quantity = Math.min(requested, maxQuantity);
  const notice = quantity === requested ? null : product.effectiveAvailable < product.maxQuantityPerOrder ? stockNotice(product.effectiveAvailable) : `Máximo ${product.maxQuantityPerOrder} por pedido.`;
  return { ...base, quantity, subtotal: money(product.price! * quantity, product.currency), notice, available: true, maxQuantity };
}

const quoteSchema = z.object({
  lines: z.array(lineSchema).max(MAX_CART_LINES, "Demasiados productos en el carrito."),
  couponCode: z.string().trim().max(50).optional(),
});

/**
 * POST /api/tienda/carrito/cotizar. Precios, subtotales y total salen de la base. Ids desconocidos u ocultos se omiten
 * (no hay nombre ni imagen que mostrar; el checkout los rechaza). No hay módulo de cupones: cualquier código es inválido.
 */
export async function quoteCart(deps: Pick<StoreDeps, "db" | "now">, body: unknown): Promise<StoreResult<CartQuoteResponse>> {
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa tu carrito.", zodFieldErrors(parsed.error));
  const products = await loadForSale(deps.db, nowOf(deps));
  const byId = new Map(products.map((product) => [product.id, product]));

  const lines = normalizeLines(parsed.data.lines).flatMap((line) => {
    const product = byId.get(line.productId);
    return product ? [quoteLine(product, line.quantity)] : [];
  });
  const currency = lines[0]?.unitPrice.currency ?? products[0]?.currency ?? "mxn";
  const subtotal = lines.reduce((sum, line) => sum + (line.available ? line.subtotal.amount : 0), 0);
  return ok({
    lines,
    subtotal: money(subtotal, currency),
    discount: null,
    coupon: null,
    couponError: parsed.data.couponCode ? "Este cupón no es válido." : null,
    total: money(subtotal, currency),
  });
}
```

- [ ] **Step 5: Add the route handlers**

Create `apps/inttimo/src/app/api/tienda/productos/route.ts`:

```ts
import { getCatalog } from "@/server/store/catalog";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Catálogo publicado (CatalogResponse en src/lib/store/contract.ts). */
export async function GET() {
  return storeRoute("store_catalog", async () => storeResponse(await getCatalog(getStoreDeps())));
}
```

Create `apps/inttimo/src/app/api/tienda/productos/[slug]/route.ts`:

```ts
import { getProduct } from "@/server/store/catalog";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Detalle de producto (ProductDetail); 404 si no está publicado. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tienda/productos/[slug]">) {
  return storeRoute("store_product", async () => {
    const { slug } = await ctx.params;
    return storeResponse(await getProduct(getStoreDeps(), slug));
  });
}
```

Create `apps/inttimo/src/app/api/tienda/carrito/cotizar/route.ts`:

```ts
import { quoteCart } from "@/server/store/catalog";
import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

const MAX_BODY_BYTES = 16_000;

/** Precios y totales del carrito calculados en el servidor (CartQuoteResponse). */
export async function POST(request: Request) {
  return storeRoute("store_cart_quote", async () => storeResponse(await quoteCart(getStoreDeps(), await readJson(request, MAX_BODY_BYTES))));
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-catalog.test.ts`
Expected: PASS (22 tests).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS (presale tests unchanged), no type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add apps/inttimo/src/server/store apps/inttimo/src/server/presale/runtime.ts apps/inttimo/src/content/store-products.ts apps/inttimo/src/app/api/tienda apps/inttimo/tests/store-helpers.ts apps/inttimo/tests/store-catalog.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store catalog, product detail and server-side cart quote

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Delivery options, cart shipping quote and postal-code lookup

**Files:**
- Create: `apps/inttimo/src/server/store/terms.ts`
- Create: `apps/inttimo/src/server/store/shipping.ts`
- Create: `apps/inttimo/src/server/store/postal-code.ts`
- Create: `apps/inttimo/src/app/api/tienda/entrega/route.ts`
- Create: `apps/inttimo/src/app/api/tienda/envio/cotizar/route.ts`
- Create: `apps/inttimo/src/app/api/tienda/codigo-postal/[cp]/route.ts`
- Test: `apps/inttimo/tests/store-shipping.test.ts`

**Interfaces:**
- Consumes: `getStoreSettings`, `saveStoreShippingQuote`, `getStoreShippingQuote`, `listStoreProducts`, `hitRateLimit`, `type StoreSettings`, `type ShippingProfile`, `type ShippingSelection`, `type StoreProduct` (`@inttimo/database`); `areaSchema`, `pickOptions` (`src/server/presale/shipping.ts`); `ShippingProvider`, `Parcel`, `Rate` (`src/server/shipping/provider.ts`); `common.ts`, `lines.ts` (Task 4); `getStoreProductContent` (Task 4).
- Produces:
  - `STORE_TERMS_VERSION = 1`
  - `storeShippingAvailable(settings: StoreSettings | null, provider: ShippingProvider | null): settings is StoreSettings & { shippingProfile: ShippingProfile }`
  - `getDeliveryOptions(deps: Pick<StoreDeps, "db" | "shipping">): Promise<StoreResult<DeliveryOptionsResponse>>`
  - `cartParcel(items: { product: Pick<StoreProduct, "weightGrams" | "lengthCm" | "widthCm" | "heightCm">; quantity: number }[], fallback: ShippingProfile["parcel"]): Parcel`
  - `quoteStoreShipping(deps: Pick<StoreDeps, "db" | "shipping" | "now">, input: { body: unknown; clientIp: string | null }): Promise<StoreResult<ShippingQuoteResponse>>`
  - `type ShippingChoice = { ok: true; amount: number; selection: ShippingSelection } | { ok: false; status: number; code: StoreErrorCode; field: string; message: string }`
  - `resolveStoreShippingChoice(db: Database, choice: { quoteId: string; rateId: string; postalCode: string; lines: CartLine[] }, now: Date): Promise<ShippingChoice>`
  - `lookupPostalCode(postalCode: string): Promise<StoreResult<PostalCodeLookupResponse>>`

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-shipping.test.ts`:

```ts
import { getStoreShippingQuote, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPostalCode } from "../src/server/store/postal-code.ts";
import { cartParcel, getDeliveryOptions, quoteStoreShipping, resolveStoreShippingChoice } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeShipping, PICKUP_POINTS, SHIPPING_PROFILE } from "./helpers.ts";
import { AREA, minutesAfter, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let shipping: FakeShipping;
let productId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  shipping = new FakeShipping();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const quote = (overrides: Record<string, unknown> = {}, clientIp: string | null = "7.7.7.7") =>
  quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity: 2 }], ...AREA, ...overrides }, clientIp });

async function quoted() {
  const result = await quote();
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  return result.data;
}

describe("opciones de entrega", () => {
  it("puntos de recolección, envío y versión de términos", async () => {
    expect(await getDeliveryOptions({ db, shipping })).toMatchObject({
      status: 200,
      data: { pickup: { enabled: true, points: PICKUP_POINTS }, shipping: { enabled: true }, termsVersion: STORE_TERMS_VERSION },
    });
  });

  it("sin credenciales de SkyDropX no se ofrece envío", async () => {
    const result = await getDeliveryOptions({ db, shipping: null });
    expect(result.ok && result.data.shipping.enabled).toBe(false);
  });

  it("con todo apagado no ofrece nada", async () => {
    await seedStoreSettings(db, { pickupEnabled: false, shippingEnabled: false });
    const result = await getDeliveryOptions({ db, shipping });
    expect(result.ok && result.data).toMatchObject({ pickup: { enabled: false, points: [] }, shipping: { enabled: false } });
  });
});

describe("paquete del carrito", () => {
  it("suma pesos, apila alturas y toma el mayor largo y ancho; sin medidas usa el paquete por unidad", () => {
    expect(cartParcel([{ product: { weightGrams: 1000, lengthCm: 16, widthCm: 11, heightCm: 11 }, quantity: 2 }], SHIPPING_PROFILE.parcel)).toEqual({ weightKg: 2, lengthCm: 16, widthCm: 11, heightCm: 22 });
    expect(
      cartParcel(
        [
          { product: { weightGrams: null, lengthCm: null, widthCm: null, heightCm: null }, quantity: 1 },
          { product: { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 5 }, quantity: 2 },
        ],
        SHIPPING_PROFILE.parcel,
      ),
    ).toEqual({ weightKg: 1.8, lengthCm: 30, widthCm: 20, heightCm: 18 });
  });
});

describe("cotizar envío del carrito", () => {
  it("cotiza con SkyDropX, guarda la cotización y devuelve económica y express", async () => {
    const data = await quoted();
    expect(data.rates).toEqual([
      { id: "economico", label: "Envío económico", carrier: "Estafeta", service: "Terrestre", days: 5, price: { amount: 18_000, currency: "mxn" } },
      { id: "express", label: "Envío express", carrier: "DHL", service: "Express", days: 1, price: { amount: 32_050, currency: "mxn" } },
    ]);
    expect(data.expiresAt).toBe(minutesAfter(120).toISOString());
    expect(shipping.quotes[0]).toEqual({ from: SHIPPING_PROFILE.origin, to: AREA, parcel: { weightKg: 2, lengthCm: 16, widthCm: 11, heightCm: 22 }, carriers: [] });
    expect(await getStoreShippingQuote(db, data.quoteId)).toMatchObject({ postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }], currency: "mxn" });
  });

  it("valida la dirección con claves sin prefijo (el checkout agrega address.)", async () => {
    const result = await quote({ postalCode: "123" });
    expect(result).toMatchObject({ status: 400, body: { error: { code: "validation_error", fieldErrors: { postalCode: ["Código postal de 5 dígitos."] } } } });
    expect(await quote({ lines: [] })).toMatchObject({ status: 400, body: { error: { fieldErrors: { lines: ["Tu carrito está vacío."] } } } });
  });

  it("producto que no se vende: out_of_stock", async () => {
    expect(await quote({ lines: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] })).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
  });

  it("envío apagado: service_unavailable", async () => {
    await seedStoreSettings(db, { shippingEnabled: false });
    expect(await quote()).toMatchObject({ status: 409, body: { error: { code: "service_unavailable" } } });
  });

  it("SkyDropX caído: 503; sin tarifas: 422", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    shipping.fail = true;
    expect(await quote()).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    shipping.fail = false;
    shipping.rates = [];
    expect(await quote()).toMatchObject({ status: 422, body: { error: { code: "validation_error" } } });
  });

  it("límite de cotizaciones por IP", async () => {
    for (let i = 0; i < 20; i++) expect((await quote()).status).toBe(200);
    expect(await quote()).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});

describe("tarifa elegida en el checkout", () => {
  it("devuelve el costo y la selección de la cotización guardada", async () => {
    const data = await quoted();
    const choice = await resolveStoreShippingChoice(db, { quoteId: data.quoteId, rateId: "express", postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }] }, T0);
    expect(choice).toMatchObject({ ok: true, amount: 32_050, selection: { provider: "skydropx", quotationId: "quo_1", rateId: "rate_exp", carrier: "DHL", service: "Express", days: 1 } });
  });

  it("rechaza cotizaciones de otro carrito, otro código postal, vencidas o inexistentes", async () => {
    const data = await quoted();
    const base = { quoteId: data.quoteId, rateId: "economico", postalCode: AREA.postalCode, lines: [{ productId, quantity: 2 }] };
    expect(await resolveStoreShippingChoice(db, { ...base, postalCode: "06700" }, T0)).toMatchObject({ ok: false, status: 409, code: "quote_expired", field: "address.postalCode" });
    expect(await resolveStoreShippingChoice(db, { ...base, lines: [{ productId, quantity: 3 }] }, T0)).toMatchObject({ ok: false, code: "quote_expired", field: "shipping" });
    expect(await resolveStoreShippingChoice(db, base, minutesAfter(121))).toMatchObject({ ok: false, code: "quote_expired", field: "shipping" });
    expect(await resolveStoreShippingChoice(db, { ...base, quoteId: "x" }, T0)).toMatchObject({ ok: false, code: "quote_expired" });
    expect(await resolveStoreShippingChoice(db, { ...base, rateId: "otra" }, T0)).toMatchObject({ ok: false, status: 400, code: "validation_error", field: "shipping" });
  });
});

describe("código postal", () => {
  it("sin catálogo conectado siempre es 404; si no son 5 dígitos, 400", async () => {
    expect(await lookupPostalCode("31000")).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    expect(await lookupPostalCode("31a")).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-shipping.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/postal-code.ts` (modules do not exist yet).

- [ ] **Step 3: Implement**

Create `apps/inttimo/src/server/store/terms.ts`:

```ts
/**
 * Versión vigente de los Términos de la tienda. El checkout debe aceptar exactamente esta versión (409 terms_outdated si no).
 * Súbela cuando cambie el texto de /terminos-y-condiciones. Hoy rige el texto aprobado el 30 de septiembre de 2026 (el de la
 * preventa); los Términos propios de la tienda están pendientes (docs/store/BACKEND-PLAN.md).
 */
export const STORE_TERMS_VERSION = 1;
```

Create `apps/inttimo/src/server/store/shipping.ts`:

```ts
import {
  getStoreSettings,
  getStoreShippingQuote,
  hitRateLimit,
  listStoreProducts,
  saveStoreShippingQuote,
  type Database,
  type ShippingProfile,
  type ShippingSelection,
  type StoreProduct,
  type StoreSettings,
} from "@inttimo/database";
import { getStoreProductContent } from "../../content/store-products.ts";
import type { CartLine, DeliveryOptionsResponse, ShippingQuoteResponse, StoreErrorCode } from "../../lib/store/contract.ts";
import { areaSchema, pickOptions } from "../presale/shipping.ts";
import type { Parcel, Rate, ShippingProvider } from "../shipping/provider.ts";
import { fail, hash, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { cartLinesSchema, normalizeLines, sameLines } from "./lines.ts";
import { STORE_TERMS_VERSION } from "./terms.ts";

/** Tiempo que la web respeta una cotización (SkyDropX la mantiene 24 h). */
const QUOTE_TTL_MINUTES = 120;
const RATE_LIMIT = { limit: 20, windowSeconds: 600 };
const RATE_LABELS: Record<string, string> = { economico: "Envío económico", express: "Envío express" };

/** El envío a domicilio existe si está activo, tiene origen y paquete configurados y hay credenciales de SkyDropX. */
export function storeShippingAvailable(settings: StoreSettings | null, provider: ShippingProvider | null): settings is StoreSettings & { shippingProfile: ShippingProfile } {
  return !!settings && settings.shippingEnabled && settings.shippingProfile !== null && provider !== null;
}

/** GET /api/tienda/entrega */
export async function getDeliveryOptions(deps: Pick<StoreDeps, "db" | "shipping">): Promise<StoreResult<DeliveryOptionsResponse>> {
  const settings = await getStoreSettings(deps.db);
  const pickupEnabled = !!settings?.pickupEnabled && settings.pickupPoints.length > 0;
  return ok({
    pickup: { enabled: pickupEnabled, points: pickupEnabled ? settings!.pickupPoints.map(({ id, name, schedule }) => ({ id, name, schedule })) : [] },
    shipping: { enabled: storeShippingAvailable(settings, deps.shipping) },
    termsVersion: STORE_TERMS_VERSION,
  });
}

/**
 * Paquete del carrito con la misma regla que la preventa (`parcelFor`): se suman pesos, se apilan alturas y se toma el
 * mayor largo y ancho. Un producto sin peso o medidas usa el paquete por unidad de la configuración. Para UNO+UNO da el
 * mismo paquete que la preventa; con varios productos sobrestima el volumen (nunca se cobra de menos).
 */
export function cartParcel(items: { product: Pick<StoreProduct, "weightGrams" | "lengthCm" | "widthCm" | "heightCm">; quantity: number }[], fallback: ShippingProfile["parcel"]): Parcel {
  let weightKg = 0;
  let lengthCm = 0;
  let widthCm = 0;
  let heightCm = 0;
  for (const { product, quantity } of items) {
    const measured = !!(product.weightGrams && product.lengthCm && product.widthCm && product.heightCm);
    const unit = measured ? { weightKg: product.weightGrams! / 1000, lengthCm: product.lengthCm!, widthCm: product.widthCm!, heightCm: product.heightCm! } : fallback;
    weightKg += unit.weightKg * quantity;
    lengthCm = Math.max(lengthCm, unit.lengthCm);
    widthCm = Math.max(widthCm, unit.widthCm);
    heightCm += unit.heightCm * quantity;
  }
  return { weightKg: Math.round(weightKg * 1000) / 1000, lengthCm, widthCm, heightCm };
}

const quoteRequestSchema = areaSchema.extend({ lines: cartLinesSchema });

/** POST /api/tienda/envio/cotizar: cotiza el carrito con SkyDropX y guarda las opciones (el costo cobrado sale de aquí). */
export async function quoteStoreShipping(deps: Pick<StoreDeps, "db" | "shipping" | "now">, input: { body: unknown; clientIp: string | null }): Promise<StoreResult<ShippingQuoteResponse>> {
  const now = deps.now?.() ?? new Date();
  const settings = await getStoreSettings(deps.db);
  if (!storeShippingAvailable(settings, deps.shipping)) return fail(409, "service_unavailable", "El envío a domicilio no está disponible. Puedes elegir recolección en Chihuahua.");

  const parsed = quoteRequestSchema.safeParse(input.body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa la dirección.", zodFieldErrors(parsed.error));
  const { lines: rawLines, ...area } = parsed.data;
  const lines = normalizeLines(rawLines);

  const products = new Map((await listStoreProducts(deps.db, { publishedOnly: true })).map((product) => [product.id, product]));
  const items = lines.map((line) => ({ product: products.get(line.productId), quantity: line.quantity }));
  if (items.some(({ product }) => !product || product.price === null || product.saleStatus === "coming_soon" || !getStoreProductContent(product.slug))) {
    return fail(409, "out_of_stock", "Revisa tu carrito: hay productos que ya no están disponibles.");
  }

  if (input.clientIp && (await hitRateLimit(deps.db, `store:quote:${hash(input.clientIp)}`, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds))) {
    return fail(429, "rate_limited", "Demasiadas cotizaciones. Espera unos minutos e inténtalo de nuevo.");
  }

  const profile = settings.shippingProfile;
  const currency = items[0]!.product!.currency;
  let result: { quotationId: string; rates: Rate[] };
  try {
    result = await deps.shipping!.quote({ from: profile.origin, to: area, parcel: cartParcel(items.map(({ product, quantity }) => ({ product: product!, quantity })), profile.parcel), carriers: profile.carriers });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_shipping_quote_failed", error: String(error).slice(0, 500) }));
    return fail(503, "service_unavailable", "No pudimos cotizar el envío en este momento. Inténtalo de nuevo en unos minutos o elige recolección en Chihuahua.");
  }

  const options = pickOptions(result.rates, currency);
  if (!options.length) {
    console.warn(JSON.stringify({ level: "warn", msg: "store_shipping_no_rates", postalCode: area.postalCode, rates: result.rates.length }));
    return fail(422, "validation_error", "No encontramos paqueterías para ese código postal. Revisa los datos o escríbenos para ayudarte.");
  }

  const quote = await saveStoreShippingQuote(deps.db, {
    lines,
    postalCode: area.postalCode,
    quotationId: result.quotationId,
    currency,
    options: options.map(({ id, rateId, carrier, service, days, amount }) => ({ id, rateId, carrier, service, days, amount })),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MINUTES * 60_000),
    createdAt: now,
  });

  return ok({
    quoteId: quote.id,
    expiresAt: quote.expiresAt.toISOString(),
    rates: quote.options.map(({ id, carrier, service, days, amount }) => ({ id, label: RATE_LABELS[id] ?? "Envío", carrier, service, days, price: { amount, currency: quote.currency } })),
  });
}

export type ShippingChoice = { ok: true; amount: number; selection: ShippingSelection } | { ok: false; status: number; code: StoreErrorCode; field: string; message: string };

/** Valida en el checkout la tarifa elegida contra la cotización guardada: mismo carrito, mismo código postal, vigente. */
export async function resolveStoreShippingChoice(db: Database, choice: { quoteId: string; rateId: string; postalCode: string; lines: CartLine[] }, now: Date): Promise<ShippingChoice> {
  const expired = (field: string, message: string): ShippingChoice => ({ ok: false, status: 409, code: "quote_expired", field, message });
  const quote = await getStoreShippingQuote(db, choice.quoteId);
  if (!quote) return expired("shipping", "Vuelve a calcular el envío.");
  if (quote.expiresAt <= now) return expired("shipping", "La cotización de envío expiró. Vuelve a calcularla.");
  if (quote.postalCode !== choice.postalCode) return expired("address.postalCode", "El código postal cambió: vuelve a calcular el envío.");
  if (!sameLines(quote.lines, choice.lines)) return expired("shipping", "Cambiaste tu carrito: vuelve a calcular el envío.");
  const option = quote.options.find((candidate) => candidate.id === choice.rateId);
  if (!option) return { ok: false, status: 400, code: "validation_error", field: "shipping", message: "Elige una opción de envío." };
  return {
    ok: true,
    amount: option.amount,
    selection: { provider: "skydropx", quotationId: quote.quotationId, rateId: option.rateId, carrier: option.carrier, service: option.service, days: option.days, quotedAt: quote.createdAt.toISOString() },
  };
}
```

Create `apps/inttimo/src/server/store/postal-code.ts`:

```ts
import type { PostalCodeLookupResponse } from "../../lib/store/contract.ts";
import { fail, type StoreResult } from "./common.ts";

/**
 * GET /api/tienda/codigo-postal/[cp]. Todavía no hay catálogo de códigos postales (SEPOMEX) conectado: siempre responde
 * 404 y el checkout deja escribir estado, ciudad y colonia a mano. Para conectar un proveedor solo cambia este archivo.
 */
export async function lookupPostalCode(postalCode: string): Promise<StoreResult<PostalCodeLookupResponse>> {
  if (!/^\d{5}$/.test(postalCode)) return fail(400, "validation_error", "Código postal de 5 dígitos.", { postalCode: ["Código postal de 5 dígitos."] });
  return fail(404, "not_found", "No reconocimos ese código postal. Escribe los datos a mano.");
}
```

Create `apps/inttimo/src/app/api/tienda/entrega/route.ts`:

```ts
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";
import { getDeliveryOptions } from "@/server/store/shipping";

/** Métodos de entrega activos, puntos de recolección y versión vigente de los Términos (DeliveryOptionsResponse). */
export async function GET() {
  return storeRoute("store_delivery_options", async () => storeResponse(await getDeliveryOptions(getStoreDeps())));
}
```

Create `apps/inttimo/src/app/api/tienda/envio/cotizar/route.ts`:

```ts
import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { clientIp, getStoreDeps } from "@/server/store/runtime";
import { quoteStoreShipping } from "@/server/store/shipping";

const MAX_BODY_BYTES = 8_000;

/** Cotización de SkyDropX para el carrito (ShippingQuoteRequest → ShippingQuoteResponse). */
export async function POST(request: Request) {
  return storeRoute("store_shipping_quote", async () =>
    storeResponse(await quoteStoreShipping(getStoreDeps(), { body: await readJson(request, MAX_BODY_BYTES), clientIp: clientIp(request) })),
  );
}
```

Create `apps/inttimo/src/app/api/tienda/codigo-postal/[cp]/route.ts`:

```ts
import { storeResponse, storeRoute } from "@/server/store/http";
import { lookupPostalCode } from "@/server/store/postal-code";

/** Estado, municipio y colonias por código postal (hoy siempre 404: sin catálogo conectado). */
export async function GET(_request: Request, ctx: RouteContext<"/api/tienda/codigo-postal/[cp]">) {
  return storeRoute("store_postal_code", async () => {
    const { cp } = await ctx.params;
    return storeResponse(await lookupPostalCode(cp));
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-shipping.test.ts`
Expected: PASS (13 tests).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/server/store apps/inttimo/src/app/api/tienda apps/inttimo/tests/store-shipping.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store delivery options, cart shipping quote and postal code lookup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Task 6: Stripe gateway for store sessions and the checkout endpoint

**Files:**
- Modify: `apps/inttimo/src/server/presale/gateway.ts`
- Modify: `apps/inttimo/src/server/presale/runtime.ts`
- Modify: `apps/inttimo/tests/helpers.ts`
- Create: `apps/inttimo/src/server/store/checkout.ts`
- Create: `apps/inttimo/src/app/api/tienda/checkout/route.ts`
- Test: `apps/inttimo/tests/store-checkout.test.ts`

**Interfaces:**
- Consumes: `createStoreOrder`, `attachStoreCheckoutSession`, `markStoreCheckoutCreateFailed`, `releaseExpiredStoreOrders`, `findStoreOrderByIdempotencyKey`, `getStoreSettings`, `listStoreProducts`, `hitRateLimit`, error classes `InsufficientStoreStockError`, `StoreProductUnavailableError`, `InvalidStoreOrderError` (`@inttimo/database`); `addressSchema` (`server/presale/shipping.ts`); `resolveStoreShippingChoice`, `storeShippingAvailable` (Task 5); `STORE_TERMS_VERSION` (Task 5); `common.ts`, `lines.ts` (Task 4).
- Produces:
  - `CheckoutSnapshot` gains `kind: "presale" | "store"` and `storeOrderId: string | null` (`reservationId` is only set for presale sessions).
  - `type CreateStoreCheckoutInput = { orderId: string; orderNumber: string; currency: string; lines: { name: string; unitAmount: number; quantity: number }[]; deliveryMethod: "shipping" | "pickup"; shippingAmount: number; shippingLabel: string | null; email: string; successUrl: string; cancelUrl: string; expiresAt: Date }`
  - `PaymentGateway.createStoreCheckout(input: CreateStoreCheckoutInput): Promise<{ id: string; url: string; expiresAt: Date }>`; `PaymentGateway.expireCheckout(sessionId: string): Promise<void>`
  - `FakeGateway.storeCreated: CreateStoreCheckoutInput[]`, `FakeGateway.expired: string[]`; store session ids `cs_test_store_000000000001`, …
  - `STORE_CHECKOUT_TTL_MINUTES = 31`; `checkoutFieldKey(path: PropertyKey[]): string`; `createStoreCheckout(deps: Pick<StoreDeps, "db" | "gateway" | "shipping" | "siteUrl" | "now">, input: { body: unknown; idempotencyKey: string | null; clientIp: string | null }): Promise<StoreResult<CheckoutResponse>>`

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-checkout.test.ts`:

```ts
import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  findStoreOrderBySessionId,
  markStoreCheckoutCreateFailed,
  upsertStoreProduct,
  type Database,
} from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeGateway, snapshotFromSession, type CreateStoreCheckoutInput } from "../src/server/presale/gateway.ts";
import { createStoreCheckout, STORE_CHECKOUT_TTL_MINUTES } from "../src/server/store/checkout.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { ADDRESS, FakeGateway, FakeShipping } from "./helpers.ts";
import { AREA, inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0, UNO } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let productId: string;
const deps = (now = T0) => ({ db, gateway, shipping, siteUrl: "https://inttimo.test/", now: () => now });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const body = (overrides: Record<string, unknown> = {}) => ({
  contact: { fullName: "Ana Pérez", email: "Ana@Ejemplo.com" },
  lines: [{ productId, quantity: 2 }],
  delivery: { method: "pickup", pickupPointId: "costco" },
  acceptTerms: true,
  termsVersion: STORE_TERMS_VERSION,
  marketingConsent: false,
  ...overrides,
});

let keys = 0;
const checkout = (overrides: Record<string, unknown> = {}, extra: { key?: string | null; ip?: string | null; now?: Date } = {}) =>
  createStoreCheckout(deps(extra.now), {
    body: body(overrides),
    idempotencyKey: extra.key === undefined ? `clave-prueba-${++keys}` : extra.key,
    clientIp: extra.ip === undefined ? "1.2.3.4" : extra.ip,
  });

async function shippingQuote(quantity = 2) {
  const result = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity }], ...AREA }, clientIp: null });
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  return result.data;
}

const fieldsOf = (result: Awaited<ReturnType<typeof checkout>>) => (result.ok ? {} : (result.body.error.fieldErrors ?? {}));

describe("pasarela de Stripe para la tienda", () => {
  function captureStripe() {
    const calls: { params: Stripe.Checkout.SessionCreateParams; options: Stripe.RequestOptions | undefined }[] = [];
    const expired: string[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => {
            calls.push({ params, options });
            return { id: "cs_x", url: "https://checkout.stripe.test/x", expires_at: 2_000_000_000 };
          },
          expire: async (id: string) => {
            expired.push(id);
            return { id };
          },
        },
      },
    } as unknown as Stripe;
    return { gateway: createStripeGateway(stripe), calls, expired };
  }

  it("una línea por producto, envío como tarifa fija, metadata de la tienda e idempotencia por pedido", async () => {
    const { gateway, calls, expired } = captureStripe();
    await gateway.createStoreCheckout({
      orderId: "pedido-1",
      orderNumber: "INT-ABCDEFGHJK",
      currency: "mxn",
      lines: [{ name: "UNO+UNO", unitAmount: 50_000, quantity: 2 }],
      deliveryMethod: "shipping",
      shippingAmount: 18_000,
      shippingLabel: "Envío · Estafeta Terrestre",
      email: "a@b.c",
      successUrl: "s",
      cancelUrl: "c",
      expiresAt: new Date(2_000_000_000_000),
    });
    const { params, options } = calls[0]!;
    expect(params.line_items).toEqual([{ quantity: 2, price_data: { currency: "mxn", unit_amount: 50_000, product_data: { name: "UNO+UNO" } } }]);
    expect(params).toMatchObject({ client_reference_id: "pedido-1", metadata: { kind: "store", orderId: "pedido-1", orderNumber: "INT-ABCDEFGHJK" }, success_url: "s", cancel_url: "c", expires_at: 2_000_000_000 });
    expect(params.shipping_options?.[0]?.shipping_rate_data).toMatchObject({ type: "fixed_amount", display_name: "Envío · Estafeta Terrestre", fixed_amount: { amount: 18_000, currency: "mxn" } });
    expect(options).toEqual({ idempotencyKey: "store-checkout-pedido-1" });

    await gateway.expireCheckout("cs_x");
    expect(expired).toEqual(["cs_x"]);
  });

  const session = (overrides: Record<string, unknown>) =>
    ({ id: "cs_1", status: "open", payment_status: "unpaid", payment_intent: null, amount_total: 100, currency: "mxn", collected_information: null, metadata: {}, client_reference_id: null, ...overrides }) as unknown as Stripe.Checkout.Session;

  it("distingue las sesiones de la tienda por metadata.kind; el resto sigue siendo preventa", () => {
    expect(snapshotFromSession(session({ client_reference_id: "pedido-1", metadata: { kind: "store", orderId: "pedido-1" } }))).toMatchObject({ kind: "store", storeOrderId: "pedido-1", reservationId: null });
    expect(snapshotFromSession(session({ client_reference_id: "reserva-1" }))).toMatchObject({ kind: "presale", reservationId: "reserva-1", storeOrderId: null });
  });
});

describe("checkout de la tienda", () => {
  it("recolección: crea el pedido con precios de la base y la sesión de Stripe", async () => {
    const result = await checkout({}, { key: "clave-0001" });
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    expect(result.status).toBe(201);
    expect(result.data.orderNumber).toMatch(/^INT-[2-9A-HJ-NP-Z]{10}$/);
    expect(result.data.checkoutUrl).toBe("https://checkout.stripe.test/cs_test_store_000000000001");

    const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
    expect(order).toMatchObject({ paymentStatus: "pending", deliveryMethod: "pickup", pickupPointId: "costco", email: "ana@ejemplo.com", totalAmount: 100_000, termsVersion: STORE_TERMS_VERSION, idempotencyKey: "clave-0001" });
    expect(gateway.storeCreated[0]).toMatchObject({
      orderId: order.id,
      orderNumber: result.data.orderNumber,
      currency: "mxn",
      lines: [{ name: "UNO+UNO", unitAmount: 50_000, quantity: 2 }],
      deliveryMethod: "pickup",
      shippingAmount: 0,
      shippingLabel: null,
      email: "ana@ejemplo.com",
      successUrl: "https://inttimo.test/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://inttimo.test/checkout?pago=cancelado",
    } satisfies Partial<CreateStoreCheckoutInput>);
    expect(gateway.storeCreated[0]!.expiresAt.getTime() - T0.getTime()).toBe(STORE_CHECKOUT_TTL_MINUTES * 60_000);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 2 });
  });

  it("envío: cobra la tarifa cotizada en el mismo pago", async () => {
    const quote = await shippingQuote();
    const result = await checkout({ delivery: { method: "shipping", quoteId: quote.quoteId, rateId: "express", address: SHIP_ADDRESS } });
    expect(result.status).toBe(201);
    expect(gateway.storeCreated[0]).toMatchObject({ deliveryMethod: "shipping", shippingAmount: 32_050, shippingLabel: "Envío · DHL Express" });
    const order = (await findStoreOrderBySessionId(db, "cs_test_store_000000000001"))!;
    expect(order).toMatchObject({
      shippingAmount: 32_050,
      totalAmount: 132_050,
      deliveryAddress: { name: "Ana Pérez", phone: "6141234567", street: ADDRESS.street, neighborhood: ADDRESS.neighborhood, postalCode: ADDRESS.postalCode, reference: ADDRESS.reference },
      shippingSelection: { provider: "skydropx", rateId: "rate_exp", carrier: "DHL", service: "Express" },
    });
  });

  it("la cotización tiene que coincidir con el carrito y la dirección y seguir vigente", async () => {
    const quote = await shippingQuote();
    const shippingTo = (address: Record<string, unknown>, lines = [{ productId, quantity: 2 }]) => ({ lines, delivery: { method: "shipping", quoteId: quote.quoteId, rateId: "economico", address } });

    const otherPostalCode = await checkout(shippingTo({ ...SHIP_ADDRESS, postalCode: "06700" }));
    expect(otherPostalCode).toMatchObject({ status: 409, body: { error: { code: "quote_expired" } } });
    expect(fieldsOf(otherPostalCode)).toHaveProperty(["address.postalCode"]);

    const otherCart = await checkout(shippingTo(SHIP_ADDRESS, [{ productId, quantity: 3 }]));
    expect(otherCart).toMatchObject({ status: 409, body: { error: { code: "quote_expired", fieldErrors: { shipping: ["Cambiaste tu carrito: vuelve a calcular el envío."] } } } });

    expect(await checkout(shippingTo(SHIP_ADDRESS), { now: minutesAfter(180) })).toMatchObject({ status: 409, body: { error: { code: "quote_expired" } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("errores de validación con las claves que pinta el checkout", async () => {
    const invalid = await checkout({ contact: { fullName: "", email: "no-es-correo" }, delivery: { method: "pickup" }, acceptTerms: false });
    expect(invalid).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(Object.keys(fieldsOf(invalid))).toEqual(expect.arrayContaining(["fullName", "email", "pickupPointId", "acceptTerms"]));

    const noStreet = await checkout({ delivery: { method: "shipping", quoteId: "x", rateId: "economico", address: { ...SHIP_ADDRESS, street: "" } } });
    expect(Object.keys(fieldsOf(noStreet))).toContain("address.street");

    expect(Object.keys(fieldsOf(await checkout({ delivery: undefined })))).toContain("deliveryMethod");
    expect(fieldsOf(await checkout({ delivery: { method: "pickup", pickupPointId: "otro" } }))).toEqual({ pickupPointId: ["Elige el punto de recolección."] });
  });

  it("cupón, versión de términos y campo trampa", async () => {
    expect(await checkout({ couponCode: "VERANO" })).toMatchObject({ status: 422, body: { error: { code: "validation_error", fieldErrors: { couponCode: ["Este cupón no es válido."] } } } });
    expect(await checkout({ termsVersion: STORE_TERMS_VERSION + 1 })).toMatchObject({ status: 409, body: { error: { code: "terms_outdated" } } });
    expect(await checkout({ website: "https://spam.test" })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(gateway.storeCreated).toHaveLength(0);
  });

  it("sin stock responde out_of_stock con el nombre del producto; más del máximo es validation_error", async () => {
    expect((await checkout({ lines: [{ productId, quantity: 10 }] })).status).toBe(201);
    expect((await checkout({ lines: [{ productId, quantity: 10 }] })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }] })).toMatchObject({
      status: 409,
      body: { error: { code: "out_of_stock", message: "UNO+UNO: Este producto se agotó.", fieldErrors: { lines: ["UNO+UNO: Este producto se agotó."] } } },
    });
    expect(await checkout({ lines: [{ productId, quantity: 11 }] })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });

  it("no vende productos sin precio ni ids desconocidos", async () => {
    expect(await checkout({ lines: [{ productId: "prod_uno_mas_uno", quantity: 1 }] })).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
    await upsertStoreProduct(db, { slug: UNO, name: "UNO+UNO", price: null });
    expect(await checkout()).toMatchObject({ status: 409, body: { error: { code: "out_of_stock" } } });
  });

  it("si la ruta caliente no libera lo suficiente, libera en bloque y reintenta una vez", async () => {
    await upsertStoreProduct(db, { slug: UNO, name: "UNO+UNO", maxQuantityPerOrder: 20 });
    // 12 pedidos de 1 pieza, todos vencidos: la ruta caliente libera 10 (quedan 18 libres) y la compra pide 19.
    const held = [];
    for (let n = 0; n < 12; n++) held.push((await createStoreOrder(db, pickupOrderFor(productId, 1), T0)).order);
    for (const order of held) await attachStoreCheckoutSession(db, order.id, { id: `cs_old_${order.id}`, url: "https://checkout.stripe.test/x", expiresAt: minutesAfter(-60) });

    const result = await checkout({ lines: [{ productId, quantity: 19 }] });
    expect(result.status).toBe(201);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 19 });
  });

  it("la misma Idempotency-Key devuelve la misma sesión mientras siga vigente; después, 409", async () => {
    const first = await checkout({}, { key: "clave-repetida" });
    const second = await checkout({}, { key: "clave-repetida" });
    expect(second).toMatchObject({ status: 200, data: { checkoutUrl: first.ok ? first.data.checkoutUrl : "" } });
    expect(gateway.storeCreated).toHaveLength(1);
    expect(await checkout({}, { key: "clave-repetida", now: minutesAfter(40) })).toMatchObject({ status: 409, body: { error: { code: "validation_error" } } });
    expect(await checkout({}, { key: "corta" })).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
  });

  it("si Stripe falla, libera el apartado y responde 503", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.fail = true;
    expect(await checkout({}, { key: "clave-stripe-caido" })).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    expect(await findStoreOrderByIdempotencyKey(db, "clave-stripe-caido")).toMatchObject({ paymentStatus: "failed", inventoryReserved: false });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("si el pedido se cerró antes de ligar la sesión, expira la sesión en Stripe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    class ClosingGateway extends FakeGateway {
      override async createStoreCheckout(input: CreateStoreCheckoutInput) {
        await markStoreCheckoutCreateFailed(db, input.orderId, "cerrado en paralelo");
        return super.createStoreCheckout(input);
      }
    }
    gateway = new ClosingGateway();
    expect(await checkout()).toMatchObject({ status: 503, body: { error: { code: "service_unavailable" } } });
    expect(gateway.expired).toEqual(["cs_test_store_000000000001"]);
  });

  it("límite de intentos por correo", async () => {
    for (let n = 0; n < 5; n++) expect((await checkout({ lines: [{ productId, quantity: 1 }] }, { ip: null })).status).toBe(201);
    expect(await checkout({ lines: [{ productId, quantity: 1 }] }, { ip: null })).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-checkout.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/checkout.ts`.

- [ ] **Step 3: Extend the gateway**

In `apps/inttimo/src/server/presale/gateway.ts` replace the `CheckoutSnapshot` type with:

```ts
/** Estado normalizado de una sesión de Checkout; lo usan el webhook, la confirmación y la reconciliación. */
export type CheckoutSnapshot = {
  id: string;
  status: "open" | "complete" | "expired" | "unknown";
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | "unknown";
  /** "store" solo si la sesión trae metadata.kind = "store"; cualquier otra (incluidas las de preventa ya creadas) es "presale". */
  kind: "presale" | "store";
  /** Solo sesiones de preventa. */
  reservationId: string | null;
  /** Solo sesiones de la tienda. */
  storeOrderId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  shippingAddress: ShippingAddress | null;
};
```

After the `CreateCheckoutInput` type add:

```ts
/** Sesión de la tienda: una línea por producto con nombre y precio copiados al pedido (nunca del navegador). */
export type CreateStoreCheckoutInput = {
  orderId: string;
  orderNumber: string;
  currency: string;
  lines: { name: string; unitAmount: number; quantity: number }[];
  deliveryMethod: "shipping" | "pickup";
  /** Centavos; 0 en recolección. */
  shippingAmount: number;
  shippingLabel: string | null;
  email: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};
```

Replace the `PaymentGateway` interface with:

```ts
export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<{ id: string; url: string; expiresAt: Date }>;
  createStoreCheckout(input: CreateStoreCheckoutInput): Promise<{ id: string; url: string; expiresAt: Date }>;
  retrieveCheckout(sessionId: string): Promise<CheckoutSnapshot>;
  /** Cierra una sesión abierta que ya no sirve (p. ej. el pedido se cerró antes de ligarla). */
  expireCheckout(sessionId: string): Promise<void>;
}
```

In `snapshotFromSession`, replace the line `reservationId: session.client_reference_id ?? session.metadata?.reservationId ?? null,` with:

```ts
    kind: session.metadata?.kind === "store" ? "store" : "presale",
    reservationId: session.metadata?.kind === "store" ? null : (session.client_reference_id ?? session.metadata?.reservationId ?? null),
    storeOrderId: session.metadata?.kind === "store" ? (session.client_reference_id ?? session.metadata?.orderId ?? null) : null,
```

In `createStripeGateway`, after the `createCheckout` method add:

```ts
    async createStoreCheckout(input) {
      const metadata = { kind: "store", orderId: input.orderId, orderNumber: input.orderNumber, deliveryMethod: input.deliveryMethod };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: input.lines.map((line) => ({
            quantity: line.quantity,
            price_data: { currency: input.currency, unit_amount: line.unitAmount, product_data: { name: line.name } },
          })),
          customer_email: input.email,
          client_reference_id: input.orderId,
          metadata,
          payment_intent_data: {
            metadata,
            description: `Pedido inttimo ${input.orderNumber} · ${input.deliveryMethod === "pickup" ? "Recolección en Chihuahua" : "Envío a domicilio"}`,
          },
          // Dirección y tarifa se eligen en el checkout de inttimo (antes de Stripe); aquí solo se cobra.
          ...(input.shippingAmount > 0
            ? {
                shipping_options: [
                  {
                    shipping_rate_data: {
                      type: "fixed_amount" as const,
                      display_name: input.shippingLabel ?? "Envío a domicilio",
                      fixed_amount: { amount: input.shippingAmount, currency: input.currency },
                    },
                  },
                ],
              }
            : {}),
          locale: "es-419",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        },
        // Reintentos de red con el mismo pedido nunca crean dos sesiones.
        { idempotencyKey: `store-checkout-${input.orderId}` },
      );
      if (!session.url) throw new Error("Stripe no devolvió la URL de Checkout.");
      return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
    },
```

After the `retrieveCheckout` method add:

```ts
    async expireCheckout(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },
```

In `apps/inttimo/src/server/presale/runtime.ts` replace the `lazyGateway` constant with:

```ts
/** Stripe se inicializa al usarse: sin llave, la validación y las consultas siguen funcionando. */
const lazyGateway: PaymentGateway = {
  createCheckout: (input) => createStripeGateway(getStripe()).createCheckout(input),
  createStoreCheckout: (input) => createStripeGateway(getStripe()).createStoreCheckout(input),
  retrieveCheckout: (sessionId) => createStripeGateway(getStripe()).retrieveCheckout(sessionId),
  expireCheckout: (sessionId) => createStripeGateway(getStripe()).expireCheckout(sessionId),
};
```

In `apps/inttimo/tests/helpers.ts` change the gateway type import to:

```ts
import type { CheckoutSnapshot, CreateCheckoutInput, CreateStoreCheckoutInput, PaymentGateway } from "../src/server/presale/gateway.ts";
```

and replace the whole `FakeGateway` class with:

```ts
export class FakeGateway implements PaymentGateway {
  created: CreateCheckoutInput[] = [];
  storeCreated: CreateStoreCheckoutInput[] = [];
  expired: string[] = [];
  fail = false;
  snapshots = new Map<string, Partial<CheckoutSnapshot>>();

  async createCheckout(input: CreateCheckoutInput) {
    if (this.fail) throw new Error("stripe down");
    this.created.push(input);
    const id = `cs_test_${String(this.created.length).padStart(12, "0")}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
  }

  async createStoreCheckout(input: CreateStoreCheckoutInput) {
    if (this.fail) throw new Error("stripe down");
    this.storeCreated.push(input);
    const id = `cs_test_store_${String(this.storeCreated.length).padStart(12, "0")}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
  }

  async expireCheckout(sessionId: string) {
    this.expired.push(sessionId);
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutSnapshot> {
    const base = { id: sessionId, status: "open" as const, paymentStatus: "unpaid" as const, paymentIntentId: null, shippingAddress: null };
    if (sessionId.startsWith("cs_test_store_")) {
      const input = this.storeCreated[Number(sessionId.slice("cs_test_store_".length)) - 1];
      return {
        ...base,
        kind: "store",
        reservationId: null,
        storeOrderId: input?.orderId ?? null,
        amountTotal: input ? input.lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0) + input.shippingAmount : null,
        currency: input?.currency ?? null,
        ...this.snapshots.get(sessionId),
      };
    }
    const input = this.created.find((_, index) => `cs_test_${String(index + 1).padStart(12, "0")}` === sessionId);
    return {
      ...base,
      kind: "presale",
      reservationId: input?.reservationId ?? null,
      storeOrderId: null,
      amountTotal: input ? input.unitAmount * input.quantity : null,
      currency: input?.currency ?? null,
      ...this.snapshots.get(sessionId),
    };
  }
}
```

- [ ] **Step 4: Implement the checkout service and route**

Create `apps/inttimo/src/server/store/checkout.ts`:

```ts
import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  getStoreSettings,
  hitRateLimit,
  InsufficientStoreStockError,
  InvalidStoreOrderError,
  listStoreProducts,
  markStoreCheckoutCreateFailed,
  releaseExpiredStoreOrders,
  StoreProductUnavailableError,
  type Database,
  type NewStoreOrder,
  type StoreOrder,
} from "@inttimo/database";
import { z } from "zod";
import { getStoreProductContent } from "../../content/store-products.ts";
import type { CheckoutResponse } from "../../lib/store/contract.ts";
import { addressSchema } from "../presale/shipping.ts";
import { fail, hash, isUniqueViolation, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { cartLinesSchema, normalizeLines } from "./lines.ts";
import { resolveStoreShippingChoice, storeShippingAvailable } from "./shipping.ts";
import { STORE_TERMS_VERSION } from "./terms.ts";

/** Vigencia de la sesión de Stripe: 30 min (mínimo de Stripe, contado desde que la crea) + 1 min de margen por latencia y reloj. */
export const STORE_CHECKOUT_TTL_MINUTES = 31;
const RATE_LIMIT = { perIp: { limit: 10, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 600 } };
/** Liberación en bloque antes de reintentar una compra que falló por stock (la ruta caliente solo libera 10). */
const RETRY_RELEASE_LIMIT = 100;
const UNAVAILABLE = "Uno de los productos ya no está disponible. Revisa tu carrito.";
const PICK_POINT = "Elige el punto de recolección.";
const QUOTE_SHIPPING = "Calcula el envío y elige una opción.";

const phone = z.string().trim().max(30, "Teléfono no válido.").regex(/^[+\d\s().-]*$/, "Teléfono no válido.");

const checkoutSchema = z.object({
  contact: z.object({
    fullName: z.string({ error: "Escribe tu nombre completo." }).trim().min(2, "Escribe tu nombre completo.").max(120, "Nombre demasiado largo."),
    email: z.email("Correo no válido.").max(254, "Correo no válido."),
    phone: phone.optional().transform((value) => value || null),
  }),
  lines: cartLinesSchema,
  couponCode: z.string().trim().max(50).optional(),
  delivery: z.discriminatedUnion(
    "method",
    [
      z.object({ method: z.literal("pickup"), pickupPointId: z.string({ error: PICK_POINT }).trim().min(1, PICK_POINT).max(60, PICK_POINT) }),
      z.object({
        method: z.literal("shipping"),
        quoteId: z.string({ error: QUOTE_SHIPPING }).max(60, QUOTE_SHIPPING),
        rateId: z.string({ error: QUOTE_SHIPPING }).max(30, QUOTE_SHIPPING),
        address: addressSchema.extend({
          name: z.string({ error: "Indica quién recibe." }).trim().min(2, "Indica quién recibe.").max(120, "Nombre demasiado largo."),
          phone: phone.min(7, "La paquetería necesita un teléfono de contacto."),
        }),
      }),
    ],
    { error: "Elige cómo quieres recibir tu pedido." },
  ),
  acceptTerms: z.literal(true, { error: "Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar." }),
  termsVersion: z.number({ error: "Falta la versión de los términos." }).int().positive(),
  marketingConsent: z.boolean().default(false),
  website: z.string().max(200).optional(),
});

/**
 * Ruta del error de Zod → clave que pinta CheckoutView: fullName, email, phone, deliveryMethod, pickupPointId,
 * address.<campo>, shipping, acceptTerms, lines.
 */
export function checkoutFieldKey(path: PropertyKey[]): string {
  const [head, second, ...rest] = path.map(String);
  if (head === "contact" && second) return second;
  if (head === "delivery") {
    if (second === "address") return ["address", ...rest].join(".");
    if (second === "pickupPointId") return "pickupPointId";
    if (second === "quoteId" || second === "rateId") return "shipping";
    return "deliveryMethod";
  }
  if (head === "lines") return "lines";
  return path.map(String).join(".") || "_";
}

/** Misma Idempotency-Key: devuelve la misma sesión mientras el pedido siga pendiente y la sesión vigente; si no, 409. */
function replay(order: StoreOrder, now: Date): StoreResult<CheckoutResponse> {
  if (order.paymentStatus === "pending" && order.stripeCheckoutUrl && order.checkoutExpiresAt && order.checkoutExpiresAt > now) {
    return ok({ orderNumber: order.orderNumber, checkoutUrl: order.stripeCheckoutUrl, checkoutExpiresAt: order.checkoutExpiresAt.toISOString() });
  }
  return fail(409, "validation_error", "Esta compra ya se procesó. Recarga la página para iniciar una nueva.");
}

/** Crea el pedido; si falta stock y había apartados vencidos sin liberar, libera en bloque y reintenta una vez. */
async function placeOrder(db: Database, order: NewStoreOrder, now: Date) {
  try {
    return await createStoreOrder(db, order, now);
  } catch (error) {
    if (!(error instanceof InsufficientStoreStockError)) throw error;
    const freed = await releaseExpiredStoreOrders(db, now, { limit: RETRY_RELEASE_LIMIT }).catch(() => 0);
    if (!freed) throw error;
    return createStoreOrder(db, order, now);
  }
}

/**
 * POST /api/tienda/checkout. Valida datos, entrega y términos; crea el pedido pendiente apartando stock (precios de la
 * base) y la sesión de Stripe Checkout. Nunca confía en precios ni totales del navegador.
 */
export async function createStoreCheckout(
  deps: Pick<StoreDeps, "db" | "gateway" | "shipping" | "siteUrl" | "now">,
  input: { body: unknown; idempotencyKey: string | null; clientIp: string | null },
): Promise<StoreResult<CheckoutResponse>> {
  const now = deps.now?.() ?? new Date();
  const base = deps.siteUrl.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SITE_URL no está configurada.");
  if (input.idempotencyKey !== null && !/^[\w-]{8,100}$/.test(input.idempotencyKey)) {
    return fail(400, "validation_error", "Idempotency-Key no válida (8–100 caracteres: letras, números, _ o -).");
  }

  const parsed = checkoutSchema.safeParse(input.body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa los datos marcados.", zodFieldErrors(parsed.error, checkoutFieldKey));
  const request = parsed.data;
  // Campo trampa: un bot llenó el campo oculto. Respuesta genérica, sin pistas.
  if (request.website) return fail(400, "validation_error", "Revisa los datos marcados.");
  if (request.couponCode) return fail(422, "validation_error", "Este cupón no es válido.", { couponCode: ["Este cupón no es válido."] });
  if (request.termsVersion !== STORE_TERMS_VERSION) return fail(409, "terms_outdated", "Los Términos y Condiciones se actualizaron. Revísalos y vuelve a aceptarlos.");

  const lines = normalizeLines(request.lines);
  const published = new Map((await listStoreProducts(deps.db, { publishedOnly: true })).map((product) => [product.id, product]));
  if (lines.some((line) => !getStoreProductContent(published.get(line.productId)?.slug ?? ""))) return fail(409, "out_of_stock", UNAVAILABLE, { lines: [UNAVAILABLE] });
  const nameOf = (productId: string) => published.get(productId)?.name ?? "Un producto";

  // Entrega: se decide antes de Stripe. El costo de envío sale de la cotización guardada.
  const settings = await getStoreSettings(deps.db);
  const deliveryError = (field: string, message: string) => fail(400, "validation_error", "Revisa los datos de entrega.", { [field]: [message] });
  const delivery = request.delivery;
  let orderDelivery: NewStoreOrder["delivery"];
  let shippingAmount = 0;
  let shippingLabel: string | null = null;
  if (delivery.method === "pickup") {
    if (!settings?.pickupEnabled || !settings.pickupPoints.length) return deliveryError("deliveryMethod", "La recolección no está disponible.");
    const point = settings.pickupPoints.find((candidate) => candidate.id === delivery.pickupPointId);
    if (!point) return deliveryError("pickupPointId", PICK_POINT);
    orderDelivery = { method: "pickup", pickupPointId: point.id };
  } else {
    if (!storeShippingAvailable(settings, deps.shipping)) return deliveryError("deliveryMethod", "El envío a domicilio no está disponible. Puedes elegir recolección en Chihuahua.");
    const choice = await resolveStoreShippingChoice(deps.db, { quoteId: delivery.quoteId, rateId: delivery.rateId, postalCode: delivery.address.postalCode, lines }, now);
    if (!choice.ok) return fail(choice.status, choice.code, choice.message, { [choice.field]: [choice.message] });
    const { name, phone: recipientPhone, street, neighborhood, city, state, postalCode, reference } = delivery.address;
    orderDelivery = { method: "shipping", address: { name, phone: recipientPhone, street, neighborhood, city, state, postalCode, reference }, selection: choice.selection };
    shippingAmount = choice.amount;
    shippingLabel = `Envío · ${choice.selection.carrier} ${choice.selection.service}`.trim();
  }

  if (input.idempotencyKey) {
    const existing = await findStoreOrderByIdempotencyKey(deps.db, input.idempotencyKey);
    if (existing) return replay(existing, now);
  }

  const email = request.contact.email.trim().toLowerCase();
  const limited =
    (input.clientIp && (await hitRateLimit(deps.db, `store:checkout:ip:${hash(input.clientIp)}`, RATE_LIMIT.perIp.limit, RATE_LIMIT.perIp.windowSeconds))) ||
    (await hitRateLimit(deps.db, `store:checkout:email:${hash(email)}`, RATE_LIMIT.perEmail.limit, RATE_LIMIT.perEmail.windowSeconds));
  if (limited) return fail(429, "rate_limited", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");

  let created: Awaited<ReturnType<typeof createStoreOrder>>;
  try {
    created = await placeOrder(
      deps.db,
      {
        contact: { fullName: request.contact.fullName, email, phone: request.contact.phone },
        lines,
        delivery: orderDelivery,
        shippingAmount,
        termsVersion: request.termsVersion,
        marketingConsent: request.marketingConsent,
        idempotencyKey: input.idempotencyKey,
        attribution: null,
      },
      now,
    );
  } catch (error) {
    if (error instanceof InsufficientStoreStockError) {
      const message = `${nameOf(error.productId)}: ${error.message}`;
      return fail(409, "out_of_stock", message, { lines: [message] });
    }
    if (error instanceof StoreProductUnavailableError) return fail(409, "out_of_stock", UNAVAILABLE, { lines: [UNAVAILABLE] });
    if (error instanceof InvalidStoreOrderError) return fail(400, "validation_error", error.message, { lines: [error.message] });
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findStoreOrderByIdempotencyKey(deps.db, input.idempotencyKey);
      if (existing) return replay(existing, now);
    }
    throw error;
  }
  if (created.reused) return replay(created.order, now);

  const { order, items } = created;
  let session: { id: string; url: string; expiresAt: Date };
  try {
    session = await deps.gateway.createStoreCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      lines: items.map((item) => ({ name: item.name, unitAmount: item.unitAmount, quantity: item.quantity })),
      deliveryMethod: order.deliveryMethod,
      shippingAmount: order.shippingAmount,
      shippingLabel,
      email: order.email,
      successUrl: `${base}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/checkout?pago=cancelado`,
      expiresAt: new Date(now.getTime() + STORE_CHECKOUT_TTL_MINUTES * 60_000),
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_checkout_create_failed", orderId: order.id, error: String(error).slice(0, 300) }));
    await markStoreCheckoutCreateFailed(deps.db, order.id, String(error));
    return fail(503, "service_unavailable", "No pudimos conectar con el sistema de pago. Inténtalo de nuevo en unos minutos.");
  }

  if (!(await attachStoreCheckoutSession(deps.db, order.id, session))) {
    // El pedido se cerró en paralelo: nadie debe poder pagar esa sesión.
    console.error(JSON.stringify({ level: "error", msg: "store_checkout_attach_failed", orderId: order.id, sessionId: session.id }));
    await deps.gateway.expireCheckout(session.id).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", msg: "store_checkout_expire_failed", sessionId: session.id, error: String(error).slice(0, 300) }));
    });
    return fail(503, "service_unavailable", "No pudimos preparar tu pago. Inténtalo de nuevo en unos minutos.");
  }

  return ok({ orderNumber: order.orderNumber, checkoutUrl: session.url, checkoutExpiresAt: session.expiresAt.toISOString() }, 201);
}
```

Create `apps/inttimo/src/app/api/tienda/checkout/route.ts`:

```ts
import { createStoreCheckout } from "@/server/store/checkout";
import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { clientIp, getStoreDeps } from "@/server/store/runtime";

const MAX_BODY_BYTES = 32_000;

/** Crea el pedido pendiente y la sesión de Stripe Checkout (cabecera Idempotency-Key). */
export async function POST(request: Request) {
  return storeRoute("store_checkout", async () =>
    storeResponse(
      await createStoreCheckout(getStoreDeps(), {
        body: await readJson(request, MAX_BODY_BYTES),
        idempotencyKey: request.headers.get("idempotency-key"),
        clientIp: clientIp(request),
      }),
    ),
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-checkout.test.ts`
Expected: PASS (14 tests).

Run: `cd apps/inttimo && npx vitest run tests/webhook.test.ts tests/reservations.test.ts tests/fulfillment.test.ts`
Expected: PASS (presale unchanged: its sessions have no `metadata.kind`).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/inttimo/src/server/presale/gateway.ts apps/inttimo/src/server/presale/runtime.ts apps/inttimo/tests/helpers.ts apps/inttimo/src/server/store/checkout.ts apps/inttimo/src/app/api/tienda/checkout apps/inttimo/tests/store-checkout.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store checkout with Stripe sessions, idempotency and limits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Task 7: Order emails (customer once, team notice) and runtime wiring

**Files:**
- Create: `apps/inttimo/src/server/store/notifications.ts`
- Modify: `apps/inttimo/src/server/store/runtime.ts`
- Modify: `.env.example`
- Test: `apps/inttimo/tests/store-notifications.test.ts`

**Interfaces:**
- Consumes: `claimStoreConfirmationEmail`, `releaseStoreConfirmationEmail`, `addStoreOrderEvent`, `listStoreOrderItems`, `getStoreSettings`, `type PickupPoint`, `type StoreOrder`, `type StoreOrderItem` (`@inttimo/database`); `escapeHtml`, `sendMail`, `type Mail` (`@inttimo/shared-utils/mail`); `business` (`src/content/legal/business.ts`); `formatMoney` (`src/lib/format.ts`); `type MailSender` (`src/server/presale/notifications.ts`).
- Produces:
  - `storeCustomerMail(order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail`
  - `storeTeamMail(to: string, order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail`
  - `sendStoreConfirmationIfNeeded(db: Database, orderId: string, deps: { send: MailSender; notifyEmail?: string | null }): Promise<"sent" | "skipped" | "failed" | "exception">`
  - `runtime.ts`: `storeNotifyEmail(): string | null`; `confirmStorePaid(orderId: string)`; `getStoreDeps()` now sets `onPaid: confirmStorePaid`

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-notifications.test.ts`:

```ts
import { createStoreOrder, findStoreOrderById, listStoreOrderEvents, markStoreOrderPaid, sql, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendStoreConfirmationIfNeeded } from "../src/server/store/notifications.ts";
import { PICKUP_POINTS } from "./helpers.ts";
import { pickupOrderFor, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;
let orderId: string;
let sent: Mail[];
const send = async (mail: Mail) => void sent.push(mail);
const TEAM = "equipo@inttimo.test";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  orderId = (await createStoreOrder(db, pickupOrderFor(productId, 2), T0)).order.id;
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const pay = (id = orderId, paymentIntentId = "pi_1") => markStoreOrderPaid(db, id, { paymentIntentId }, { source: "stripe" });

describe("correo de pedido pagado", () => {
  it("no se envía mientras el pedido no esté pagado", async () => {
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("skipped");
    expect(sent).toEqual([]);
  });

  it("se envía una sola vez con folio, productos, total y punto, y avisa al equipo", async () => {
    await pay();
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("sent");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("skipped");

    const order = (await findStoreOrderById(db, orderId))!;
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com", TEAM]);
    expect(sent[0]!.subject).toContain(order.orderNumber);
    expect(sent[0]!.text).toContain("UNO+UNO × 2");
    expect(sent[0]!.text).toContain("Total pagado: $1,000.00");
    expect(sent[0]!.text).toContain(`Punto seleccionado: ${PICKUP_POINTS[1]!.name}`);
    expect(sent[0]!.html).toContain("<p>");
    expect(sent[1]!.subject).toBe(`Tienda: pedido pagado ${order.orderNumber}`);
    expect(order.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect((await listStoreOrderEvents(db, orderId)).map((event) => event.type)).toContain("CONFIRMATION_EMAIL_SENT");
  });

  it("si el envío falla, se libera para reintentar", async () => {
    await pay();
    const failing = async () => {
      throw new Error("smtp caído");
    };
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send: failing })).toBe("failed");
    expect((await findStoreOrderById(db, orderId))?.confirmationEmailSentAt).toBeNull();
    expect((await listStoreOrderEvents(db, orderId)).map((event) => event.type)).toContain("CONFIRMATION_EMAIL_FAILED");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("sent");
  });

  it("un fallo del aviso al equipo no cuenta como fallo", async () => {
    await pay();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const customerOnly = async (mail: Mail) => {
      if (mail.to === TEAM) throw new Error("rebote");
      sent.push(mail);
    };
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send: customerOnly, notifyEmail: TEAM })).toBe("sent");
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com"]);
  });

  it("pagado con incidencia: no confirma al cliente, solo avisa al equipo", async () => {
    await pay();
    await db.execute(sql`update store_orders set fulfillment_status = 'exception' where id = ${orderId}`);
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("exception");
    expect(sent.map((mail) => mail.to)).toEqual([TEAM]);
    expect(sent[0]!.subject).toContain("incidencia");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("skipped");
  });

  it("envío a domicilio: dirección y costo de envío", async () => {
    const { order } = await createStoreOrder(
      db,
      pickupOrderFor(productId, 1, {
        delivery: {
          method: "shipping",
          address: SHIP_ADDRESS,
          selection: { provider: "skydropx", quotationId: "quo_1", rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: T0.toISOString() },
        },
        shippingAmount: 18_000,
      }),
      T0,
    );
    await pay(order.id, "pi_2");
    expect(await sendStoreConfirmationIfNeeded(db, order.id, { send })).toBe("sent");
    expect(sent[0]!.text).toContain("Método de entrega: ENVÍO A DOMICILIO");
    expect(sent[0]!.text).toContain(SHIP_ADDRESS.street);
    expect(sent[0]!.text).toContain("Envío: $180.00");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-notifications.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/notifications.ts`.

- [ ] **Step 3: Implement**

Create `apps/inttimo/src/server/store/notifications.ts`:

```ts
/*
 * Correos de pedidos de la tienda.
 * COPIA PENDIENTE DE APROBACIÓN DE KARINA: texto funcional que no promete envío ni guía (eso lo dirán los correos de
 * ENVIADO / LISTO PARA RECOGER que manda el panel, PR B).
 */
import {
  addStoreOrderEvent,
  claimStoreConfirmationEmail,
  getStoreSettings,
  listStoreOrderItems,
  releaseStoreConfirmationEmail,
  type Database,
  type PickupPoint,
  type StoreOrder,
  type StoreOrderItem,
} from "@inttimo/database";
import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";
import { business } from "../../content/legal/business.ts";
import { formatMoney } from "../../lib/format.ts";
import type { MailSender } from "../presale/notifications.ts";

const toHtml = (lines: string[]) => lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");

function addressText(order: StoreOrder): string | null {
  const a = order.deliveryAddress;
  return a ? [a.name, a.street, a.neighborhood, `${a.postalCode} ${a.city}`, a.state, a.reference ? `Ref.: ${a.reference}` : null].filter(Boolean).join(", ") : null;
}

function itemLines(order: StoreOrder, items: StoreOrderItem[]): string[] {
  return items.map((item) => `• ${item.name} × ${item.quantity}: ${formatMoney(item.unitAmount * item.quantity, order.currency)}`);
}

/** Pedido pagado, para el cliente. */
export function storeCustomerMail(order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const pickup = order.deliveryMethod === "pickup";
  const address = addressText(order);
  const lines = [
    `Hola ${order.fullName}: recibimos tu pago. Tu pedido ${order.orderNumber} está confirmado.`,
    "",
    ...itemLines(order, items),
    `Subtotal: ${money(order.subtotalAmount)}`,
    ...(order.discountAmount ? [`Descuento: −${money(order.discountAmount)}`] : []),
    `${pickup ? "Recolección" : "Envío"}: ${money(order.shippingAmount)}`,
    `Total pagado: ${money(order.totalAmount)}`,
    "",
    `Método de entrega: ${pickup ? "RECOLECCIÓN" : "ENVÍO A DOMICILIO"}`,
    ...(pickup && point ? [`Punto seleccionado: ${point.name}`] : []),
    ...(!pickup && address ? [`Dirección de entrega: ${address}`] : []),
    "",
    pickup ? "Te avisaremos por correo cuando tu pedido esté LISTO PARA RECOGER. Espera ese aviso antes de acudir." : "Te enviaremos la guía de rastreo por correo cuando tu pedido salga.",
    "Guarda este correo y tu número de pedido como comprobante de compra.",
    "",
    `Dudas o incidencias: ${business.email} · WhatsApp ${business.whatsapp} · Horario: ${business.hours} · Respuesta: ${business.responseTime}.`,
    "",
    "— inttimo —",
  ];
  return { to: order.email, subject: `Tu pedido de inttimo está confirmado · ${order.orderNumber}`, text: lines.join("\n"), html: toHtml(lines) };
}

/** Aviso interno al equipo (pedido pagado o pago con incidencia). */
export function storeTeamMail(to: string, order: StoreOrder, items: StoreOrderItem[], point: PickupPoint | undefined): Mail {
  const exception = order.fulfillmentStatus === "exception";
  const text = [
    exception ? "ATENCIÓN: pago recibido con incidencia (sin stock para surtirlo). Revísalo en el panel y reembolsa si corresponde." : "Nuevo pedido pagado en la tienda.",
    `Folio: ${order.orderNumber}`,
    ...itemLines(order, items),
    `Entrega: ${order.deliveryMethod === "pickup" ? `Recolección${point ? ` · ${point.name}` : ""}` : "Envío a domicilio"}`,
    `Total: ${formatMoney(order.totalAmount, order.currency)}`,
  ].join("\n");
  return { to, subject: exception ? `Tienda: pago con incidencia ${order.orderNumber}` : `Tienda: pedido pagado ${order.orderNumber}`, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

/**
 * Correo de pedido pagado, una sola vez por pedido. Si el envío al cliente falla se libera la reserva para que el webhook,
 * la confirmación o `store:reconcile` reintenten. Un pedido pagado con incidencia (sin stock) no se confirma al cliente:
 * solo se avisa al equipo, que lo contacta y reembolsa desde el panel.
 */
export async function sendStoreConfirmationIfNeeded(
  db: Database,
  orderId: string,
  deps: { send: MailSender; notifyEmail?: string | null },
): Promise<"sent" | "skipped" | "failed" | "exception"> {
  const order = await claimStoreConfirmationEmail(db, orderId);
  if (!order) return "skipped";
  const items = await listStoreOrderItems(db, order.id);
  const point = (await getStoreSettings(db))?.pickupPoints.find((candidate) => candidate.id === order.pickupPointId);
  const notifyTeam = async () => {
    if (!deps.notifyEmail) return;
    await deps.send(storeTeamMail(deps.notifyEmail, order, items, point)).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "warn", msg: "store_internal_notify_failed", orderId, error: String(error).slice(0, 300) }));
    });
  };

  if (order.fulfillmentStatus === "exception") {
    await notifyTeam();
    return "exception";
  }
  try {
    await deps.send(storeCustomerMail(order, items, point));
    await addStoreOrderEvent(db, order.id, "CONFIRMATION_EMAIL_SENT", "api");
  } catch (error) {
    await releaseStoreConfirmationEmail(db, order.id);
    await addStoreOrderEvent(db, order.id, "CONFIRMATION_EMAIL_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    return "failed";
  }
  await notifyTeam();
  return "sent";
}
```

Replace the whole content of `apps/inttimo/src/server/store/runtime.ts` with:

```ts
import "server-only";
import { sendMail } from "@inttimo/shared-utils/mail";
import { getDb, getPaymentGateway, getShippingProvider } from "../presale/runtime.ts";
import type { StoreDeps } from "./common.ts";
import { sendStoreConfirmationIfNeeded } from "./notifications.ts";

export { clientIp } from "../presale/runtime.ts";

/** Correo del equipo para avisos de la tienda; si falta, el de la preventa. */
export function storeNotifyEmail(): string | null {
  return process.env.STORE_NOTIFY_EMAIL || process.env.PRESALE_NOTIFY_EMAIL || null;
}

/** Correo de pedido pagado (idempotente): lo llaman el webhook y la confirmación. */
export function confirmStorePaid(orderId: string) {
  return sendStoreConfirmationIfNeeded(getDb(), orderId, { send: sendMail, notifyEmail: storeNotifyEmail() });
}

/** Dependencias reales de la tienda (misma base, Stripe y SkyDropX que la preventa). */
export function getStoreDeps(): StoreDeps {
  return {
    db: getDb(),
    gateway: getPaymentGateway(),
    shipping: getShippingProvider(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    onPaid: confirmStorePaid,
  };
}
```

In `.env.example`, right after the line `PRESALE_NOTIFY_EMAIL=` add:

```bash
# Opcional: correo interno que recibe aviso de cada pedido pagado de la tienda (si falta, se usa PRESALE_NOTIFY_EMAIL).
STORE_NOTIFY_EMAIL=
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-notifications.test.ts`
Expected: PASS (6 tests).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/server/store/notifications.ts apps/inttimo/src/server/store/runtime.ts .env.example apps/inttimo/tests/store-notifications.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store paid-order emails, sent once, with team notice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Store settlement and routing in the shared Stripe webhook

**Files:**
- Create: `apps/inttimo/src/server/store/settlement.ts`
- Modify: `apps/inttimo/src/server/presale/webhook.ts`
- Modify: `apps/inttimo/src/app/api/webhooks/stripe/route.ts`
- Test: `apps/inttimo/tests/store-webhook.test.ts`

**Interfaces:**
- Consumes: `findStoreOrderBySessionId`, `findStoreOrderById`, `findStoreOrderByPaymentIntent`, `markStoreOrderPaid`, `markStoreOrderPaymentFailed`, `markStoreCheckoutExpired`, `markStoreOrderPaymentMismatch`, `applyStoreRefund`, `claimStripeEvent` (`@inttimo/database`); `CheckoutSnapshot` (Task 6); `SnapshotTrigger` (`server/presale/settlement.ts`); `confirmStorePaid` (Task 7).
- Produces:
  - `resolveStoreOrder(db: Executor, snapshot: CheckoutSnapshot): Promise<StoreOrder | null>`
  - `applyStoreSettlement(db: Database, order: StoreOrder, snapshot: CheckoutSnapshot, trigger: SnapshotTrigger, ctx: { source: EventSource; externalRef?: string | null }): Promise<{ order: StoreOrder; changed: boolean } | null>`
  - `WebhookOutcome` gains `{ result: "applied" | "unchanged"; storeOrderId: string; paymentStatus: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-webhook.test.ts`:

```ts
import { createStoreOrder, findStoreOrderBySessionId, listStoreOrderEvents, releaseExpiredStoreOrders, type Database, type StoreOrder } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripeEvent } from "../src/server/presale/webhook.ts";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping, refundEvent, sessionEvent } from "./helpers.ts";
import { inventoryOf, minutesAfter, pickupOrderFor, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;
let order: StoreOrder;
const SESSION = "cs_test_store_000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  const result = await createStoreCheckout(
    { db, gateway: new FakeGateway(), shipping: new FakeShipping(), siteUrl: "https://inttimo.test", now: () => T0 },
    {
      body: { contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" }, lines: [{ productId, quantity: 2 }], delivery: { method: "pickup", pickupPointId: "costco" }, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
      idempotencyKey: "clave-webhook-1",
      clientIp: null,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  order = (await findStoreOrderBySessionId(db, SESSION))!;
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

/** Sesión de la tienda pagada por el total del pedido ($1,000.00). */
const storeSession = (overrides: Partial<Stripe.Checkout.Session> = {}): Partial<Stripe.Checkout.Session> & { id: string } => ({
  id: SESSION,
  status: "complete",
  payment_status: "paid",
  payment_intent: "pi_store_1",
  amount_total: 100_000,
  currency: "mxn",
  client_reference_id: order.id,
  metadata: { kind: "store", orderId: order.id, orderNumber: order.orderNumber },
  ...overrides,
});
const reload = async () => (await findStoreOrderBySessionId(db, SESSION))!;
const eventTypes = async () => (await listStoreOrderEvents(db, order.id)).map((event) => event.type);

describe("webhook de Stripe: pedidos de la tienda", () => {
  it("pago confirmado: marca pagado, descuenta existencias y guarda el payment intent", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()))).toEqual({ result: "applied", storeOrderId: order.id, paymentStatus: "paid" });
    expect(await reload()).toMatchObject({ paymentStatus: "paid", stripePaymentIntentId: "pi_store_1", inventoryReserved: false });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 18, reserved: 0 });
  });

  it("el mismo evento dos veces se aplica una vez; otro evento del mismo pago no cambia nada", async () => {
    const event = sessionEvent("checkout.session.completed", storeSession(), "evt_tienda_1");
    await handleStripeEvent(db, event);
    expect(await handleStripeEvent(db, event)).toEqual({ result: "duplicate" });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()))).toMatchObject({ result: "unchanged", paymentStatus: "paid" });
    expect((await eventTypes()).filter((type) => type === "PAYMENT_APPROVED")).toHaveLength(1);
  });

  it("monto distinto: no marca pagado, deja excepción con su apartado y la liberación no lo toca", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ amount_total: 1 })))).toMatchObject({ result: "applied", paymentStatus: "pending" });
    expect(await reload()).toMatchObject({ paymentStatus: "pending", fulfillmentStatus: "exception", stripePaymentIntentId: "pi_store_1" });
    expect(await eventTypes()).toContain("EXCEPTION");
    expect(await releaseExpiredStoreOrders(db, minutesAfter(120))).toBe(0);
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 2 });
  });

  it("sesión vencida: cancela y libera", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.expired", storeSession({ status: "expired", payment_status: "unpaid", payment_intent: null })))).toMatchObject({ result: "applied", paymentStatus: "cancelled" });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 20, reserved: 0 });
  });

  it("pago asíncrono rechazado: queda fallido", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ payment_status: "unpaid" })))).toMatchObject({ result: "unchanged", paymentStatus: "pending" });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_failed", storeSession({ payment_status: "unpaid" })))).toMatchObject({ result: "applied", paymentStatus: "failed" });
  });

  it("pago asíncrono confirmado: queda pagado", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ payment_status: "unpaid" })));
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_succeeded", storeSession()))).toMatchObject({ result: "applied", paymentStatus: "paid" });
  });

  it("reembolsos parcial y total por payment intent, sin tocar el stock", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession()));
    expect(await handleStripeEvent(db, refundEvent("pi_store_1", 30_000))).toMatchObject({ result: "applied", storeOrderId: order.id, paymentStatus: "partially_refunded" });
    expect(await handleStripeEvent(db, refundEvent("pi_store_1", 100_000))).toMatchObject({ result: "applied", paymentStatus: "refunded" });
    expect(await reload()).toMatchObject({ amountRefunded: 100_000 });
    expect(await inventoryOf(db, productId)).toEqual({ onHand: 18, reserved: 0 });
    expect(await handleStripeEvent(db, refundEvent("pi_desconocido", 1))).toEqual({ result: "ignored" });
  });

  it("ignora sesiones de la tienda que no corresponden a un pedido", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ id: "cs_test_otra_sesion" })))).toEqual({ result: "ignored" });
    const unknown = "11111111-1111-4111-8111-111111111111";
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", storeSession({ id: "cs_test_otra_sesion", client_reference_id: unknown, metadata: { kind: "store", orderId: unknown } })))).toEqual({ result: "ignored" });
    expect(await reload()).toMatchObject({ paymentStatus: "pending" });
  });

  it("encuentra el pedido por client_reference_id si el webhook llega antes de ligar la sesión", async () => {
    const { order: early } = await createStoreOrder(db, pickupOrderFor(productId, 1), T0);
    const session = storeSession({ id: "cs_test_temprana", amount_total: 50_000, client_reference_id: early.id, metadata: { kind: "store", orderId: early.id } });
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", session))).toMatchObject({ result: "applied", storeOrderId: early.id, paymentStatus: "paid" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-webhook.test.ts`
Expected: FAIL — store sessions are resolved as presale reservations, so every session test returns `{ result: "ignored" }` and refunds return `ignored`.

- [ ] **Step 3: Implement**

Create `apps/inttimo/src/server/store/settlement.ts`:

```ts
import {
  findStoreOrderById,
  findStoreOrderBySessionId,
  markStoreCheckoutExpired,
  markStoreOrderPaid,
  markStoreOrderPaymentFailed,
  markStoreOrderPaymentMismatch,
  type Database,
  type EventSource,
  type Executor,
  type StoreOrder,
} from "@inttimo/database";
import type { CheckoutSnapshot } from "../presale/gateway.ts";
import type { SnapshotTrigger } from "../presale/settlement.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pedido de una sesión de la tienda: por id de sesión o, si el webhook llegó antes de ligarla, por el id del pedido. */
export async function resolveStoreOrder(db: Executor, snapshot: CheckoutSnapshot): Promise<StoreOrder | null> {
  const bySession = await findStoreOrderBySessionId(db, snapshot.id);
  if (bySession) return bySession;
  if (!snapshot.storeOrderId || !UUID.test(snapshot.storeOrderId)) return null;
  const byId = await findStoreOrderById(db, snapshot.storeOrderId.toLowerCase());
  // Se acepta solo si el pedido aún no tiene otra sesión.
  return byId && !byId.stripeCheckoutSessionId ? byId : null;
}

/**
 * Aplica el estado de Stripe al pedido (webhook, confirmación y reconciliación usan esta misma función). Nunca marca pagado
 * si el monto o la moneda no coinciden con el pedido: lo deja como excepción para revisión. Idempotente.
 */
export async function applyStoreSettlement(
  db: Database,
  order: StoreOrder,
  snapshot: CheckoutSnapshot,
  trigger: SnapshotTrigger,
  ctx: { source: EventSource; externalRef?: string | null },
): Promise<{ order: StoreOrder; changed: boolean } | null> {
  if (trigger === "async_failed") return markStoreOrderPaymentFailed(db, order.id, { source: ctx.source });
  if (trigger === "expired" || snapshot.status === "expired") return markStoreCheckoutExpired(db, order.id, { source: ctx.source });
  if (snapshot.paymentStatus !== "paid" && snapshot.paymentStatus !== "no_payment_required") return null;

  const expected = { amount: order.totalAmount, currency: order.currency };
  const received = { amount: snapshot.amountTotal, currency: snapshot.currency };
  if (received.amount !== expected.amount || received.currency?.toLowerCase() !== expected.currency.toLowerCase()) {
    console.error(JSON.stringify({ level: "error", msg: "store_amount_mismatch", orderId: order.id, expected, received }));
    return markStoreOrderPaymentMismatch(db, order.id, { paymentIntentId: snapshot.paymentIntentId, expected, received }, ctx);
  }
  const paid = await markStoreOrderPaid(db, order.id, { paymentIntentId: snapshot.paymentIntentId }, ctx);
  return paid ? { order: paid.order, changed: paid.outcome !== "already_paid" } : null;
}
```

Replace the whole content of `apps/inttimo/src/server/presale/webhook.ts` with:

```ts
import { applyRefund, applyStoreRefund, claimStripeEvent, findReservationByPaymentIntent, findStoreOrderByPaymentIntent, type Database } from "@inttimo/database";
import type Stripe from "stripe";
import { applyStoreSettlement, resolveStoreOrder } from "../store/settlement.ts";
import { snapshotFromSession } from "./gateway.ts";
import { applySnapshot, resolveReservation, type SnapshotTrigger } from "./settlement.ts";

const SESSION_TRIGGERS: Partial<Record<Stripe.Event["type"], SnapshotTrigger>> = {
  "checkout.session.completed": "completed",
  "checkout.session.async_payment_succeeded": "async_succeeded",
  "checkout.session.async_payment_failed": "async_failed",
  "checkout.session.expired": "expired",
};

export const HANDLED_EVENTS = [...Object.keys(SESSION_TRIGGERS), "charge.refunded"] as Stripe.Event["type"][];

export type WebhookOutcome =
  | { result: "duplicate" | "ignored" }
  | { result: "applied" | "unchanged"; reservationId: string; status: string }
  | { result: "applied" | "unchanged"; storeOrderId: string; paymentStatus: string };

/**
 * Procesa un evento ya verificado de la preventa o de la tienda. Las sesiones de la tienda traen metadata.kind = "store";
 * los reembolsos se reconocen por payment intent (primero reservas, luego pedidos de la tienda). Registrar el evento y
 * aplicar su efecto ocurre en la misma transacción: si algo falla no queda marcado y Stripe lo reintenta.
 */
export async function handleStripeEvent(db: Database, event: Stripe.Event): Promise<WebhookOutcome> {
  if (!HANDLED_EVENTS.includes(event.type)) return { result: "ignored" };

  return db.transaction(async (tx): Promise<WebhookOutcome> => {
    if (!(await claimStripeEvent(tx, event.id, event.type))) return { result: "duplicate" };
    const ctx = { source: "stripe" as const, externalRef: event.id };

    const trigger = SESSION_TRIGGERS[event.type];
    if (trigger) {
      const snapshot = snapshotFromSession(event.data.object as Stripe.Checkout.Session);
      if (snapshot.kind === "store") {
        const order = await resolveStoreOrder(tx, snapshot);
        if (!order) return { result: "ignored" };
        const settled = await applyStoreSettlement(tx, order, snapshot, trigger, ctx);
        const current = settled?.order ?? order;
        return { result: settled?.changed ? "applied" : "unchanged", storeOrderId: current.id, paymentStatus: current.paymentStatus };
      }
      const reservation = await resolveReservation(tx, snapshot);
      if (!reservation) return { result: "ignored" };
      const updated = await applySnapshot(tx, reservation, snapshot, trigger, ctx);
      return updated
        ? { result: "applied", reservationId: updated.id, status: updated.status }
        : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
    }

    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
    if (!paymentIntentId) return { result: "ignored" };

    const reservation = await findReservationByPaymentIntent(tx, paymentIntentId);
    if (reservation) {
      const updated = await applyRefund(tx, reservation, charge.amount_refunded, ctx);
      return updated
        ? { result: "applied", reservationId: updated.id, status: updated.status }
        : { result: "unchanged", reservationId: reservation.id, status: reservation.status };
    }

    // Reembolso de un pedido de la tienda: se registra; devolver piezas al inventario se decide en el panel (PR B).
    const storeOrder = await findStoreOrderByPaymentIntent(tx, paymentIntentId);
    if (!storeOrder) return { result: "ignored" };
    const refunded = await applyStoreRefund(tx, storeOrder.id, charge.amount_refunded, ctx);
    const current = refunded?.order ?? storeOrder;
    return { result: refunded?.changed ? "applied" : "unchanged", storeOrderId: current.id, paymentStatus: current.paymentStatus };
  });
}
```

Replace the whole content of `apps/inttimo/src/app/api/webhooks/stripe/route.ts` with:

```ts
import type { ApiError } from "@/server/presale/contract";
import { ConfigError, confirmPaid, getDb, getStripe, getWebhookSecret, handle } from "@/server/presale/runtime";
import { handleStripeEvent } from "@/server/presale/webhook";
import { confirmStorePaid } from "@/server/store/runtime";
import type Stripe from "stripe";

/**
 * Mismo endpoint para la preventa y la tienda (las sesiones de la tienda traen metadata.kind = "store").
 * No se oculta con la tienda: los pagos y reembolsos de pedidos existentes siempre se registran.
 * Configurar en Stripe → Webhooks con los eventos:
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired, charge.refunded.
 */
export async function POST(request: Request) {
  return handle("stripe_webhook", async () => {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    let event: Stripe.Event;
    try {
      if (!signature) throw new Error("missing signature");
      event = getStripe().webhooks.constructEvent(payload, signature, getWebhookSecret());
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      const body: ApiError = { error: { code: "invalid_signature", message: "Firma no válida." } };
      return Response.json(body, { status: 400 });
    }

    const outcome = await handleStripeEvent(getDb(), event);
    if ("reservationId" in outcome && outcome.status === "paid") await confirmPaid(outcome.reservationId);
    if ("storeOrderId" in outcome && outcome.paymentStatus === "paid") await confirmStorePaid(outcome.storeOrderId);
    return Response.json({ received: true, result: outcome.result });
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-webhook.test.ts`
Expected: PASS (9 tests).

Run: `cd apps/inttimo && npx vitest run tests/webhook.test.ts`
Expected: PASS (presale webhook unchanged).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/server/store/settlement.ts apps/inttimo/src/server/presale/webhook.ts apps/inttimo/src/app/api/webhooks/stripe/route.ts apps/inttimo/tests/store-webhook.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): route store sessions and refunds through the Stripe webhook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Order confirmation endpoint (OrderView)

**Files:**
- Create: `apps/inttimo/src/server/store/order-view.ts`
- Create: `apps/inttimo/src/server/store/confirmation.ts`
- Create: `apps/inttimo/src/app/api/tienda/pedido/confirmacion/route.ts`
- Test: `apps/inttimo/tests/store-confirmation.test.ts`

**Interfaces:**
- Consumes: `findStoreOrderBySessionId`, `listStoreOrderItems`, `listStoreOrderEvents`, `getStoreSettings`, `type StoreOrderEventType` (`@inttimo/database`); `maskEmail` (`server/presale/reservations.ts`); `getStoreProductContent` (Task 4); `applyStoreSettlement` (Task 8); `StoreDeps.onPaid` (Task 7).
- Produces:
  - `buildOrderView(db: Executor, order: StoreOrder): Promise<OrderView>`
  - `getOrderConfirmation(deps: Pick<StoreDeps, "db" | "gateway" | "onPaid">, sessionId: string | null): Promise<StoreResult<OrderConfirmationResponse>>`

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-confirmation.test.ts`:

```ts
import { findStoreOrderBySessionId, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { getOrderConfirmation } from "../src/server/store/confirmation.ts";
import { quoteStoreShipping } from "../src/server/store/shipping.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { ADDRESS, FakeGateway, FakeShipping, PICKUP_POINTS } from "./helpers.ts";
import { AREA, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let shipping: FakeShipping;
let productId: string;
const onPaid = vi.fn<(orderId: string) => Promise<void>>(async () => {});
const SESSION = "cs_test_store_000000000001";
const MXN = (amount: number) => ({ amount, currency: "mxn" });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  shipping = new FakeShipping();
  onPaid.mockClear();
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

async function buy(delivery: Record<string, unknown> = { method: "pickup", pickupPointId: "costco" }) {
  const result = await createStoreCheckout(
    { db, gateway, shipping, siteUrl: "https://inttimo.test", now: () => T0 },
    {
      body: { contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com" }, lines: [{ productId, quantity: 2 }], delivery, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
      idempotencyKey: null,
      clientIp: null,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.body));
}

const confirm = (sessionId: string | null = SESSION) => getOrderConfirmation({ db, gateway, onPaid }, sessionId);

describe("confirmación del pedido", () => {
  it("valida el session_id y no encuentra pedidos de otras sesiones", async () => {
    await buy();
    expect(await confirm(null)).toMatchObject({ status: 400, body: { error: { code: "validation_error" } } });
    expect(await confirm("no-es-sesion")).toMatchObject({ status: 400 });
    expect(await confirm("cs_test_store_999999999999")).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
  });

  it("si Stripe ya cobró, lo marca pagado sin esperar al webhook y arma el pedido", async () => {
    await buy();
    gateway.snapshots.set(SESSION, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1" });
    const result = await confirm();
    if (!result.ok) throw new Error(JSON.stringify(result.body));
    const order = (await findStoreOrderBySessionId(db, SESSION))!;
    expect(result.data).toEqual({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      paymentStatus: "paid",
      fulfillmentStatus: "confirmed",
      lines: [{ name: "UNO+UNO", image: expect.objectContaining({ src: "/images/preventa/uno-mas-uno-caja-y-mazos.jpg" }), quantity: 2, unitPrice: MXN(50_000), subtotal: MXN(100_000) }],
      subtotal: MXN(100_000),
      discount: null,
      shipping: MXN(0),
      total: MXN(100_000),
      delivery: { method: "pickup", pickupPoint: PICKUP_POINTS[1], address: null },
      email: "a***@ejemplo.com",
      shipment: null,
      events: [{ at: expect.any(String), status: "confirmed", description: "Pedido confirmado", location: null }],
    });
    expect(onPaid).toHaveBeenCalledWith(order.id);
  });

  it("sigue pendiente si el pago no ha llegado; no inventa eventos", async () => {
    await buy();
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending", events: [] } });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("si Stripe no responde, muestra el último estado conocido", async () => {
    await buy();
    vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.retrieveCheckout = async () => {
      throw new Error("stripe caído");
    };
    expect(await confirm()).toMatchObject({ status: 200, data: { paymentStatus: "pending" } });
  });

  it("envío a domicilio: dirección resumida y costo de envío", async () => {
    const quote = await quoteStoreShipping({ db, shipping, now: () => T0 }, { body: { lines: [{ productId, quantity: 2 }], ...AREA }, clientIp: null });
    if (!quote.ok) throw new Error(JSON.stringify(quote.body));
    await buy({ method: "shipping", quoteId: quote.data.quoteId, rateId: "economico", address: SHIP_ADDRESS });
    expect(await confirm()).toMatchObject({
      status: 200,
      data: {
        shipping: MXN(18_000),
        total: MXN(118_000),
        delivery: { method: "shipping", pickupPoint: null, address: { name: "Ana Pérez", line1: `${ADDRESS.street}, ${ADDRESS.neighborhood}`, city: ADDRESS.city, state: ADDRESS.state, postalCode: ADDRESS.postalCode } },
      },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-confirmation.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/confirmation.ts`.

- [ ] **Step 3: Implement**

Create `apps/inttimo/src/server/store/order-view.ts`:

```ts
import { getStoreSettings, listStoreOrderEvents, listStoreOrderItems, type Executor, type StoreOrder, type StoreOrderEventType } from "@inttimo/database";
import { getStoreProductContent } from "../../content/store-products.ts";
import type { FulfillmentStatus, Money, OrderView, TrackingEvent } from "../../lib/store/contract.ts";
import { maskEmail } from "../presale/reservations.ts";

/** Eventos del historial que ve el cliente. Solo hechos registrados (pago, panel, paquetería); nunca inventados. */
const VISIBLE_EVENTS: Partial<Record<StoreOrderEventType, { status: FulfillmentStatus; description: string }>> = {
  PAYMENT_APPROVED: { status: "confirmed", description: "Pedido confirmado" },
  LABEL_GENERATED: { status: "label_generated", description: "Guía generada" },
  READY_FOR_PICKUP: { status: "ready_for_pickup", description: "Listo para recoger" },
  HANDED_TO_CARRIER: { status: "handed_to_carrier", description: "Entregado a paquetería" },
  IN_TRANSIT: { status: "in_transit", description: "En tránsito" },
  OUT_FOR_DELIVERY: { status: "out_for_delivery", description: "En reparto" },
  DELIVERED: { status: "delivered", description: "Entregado" },
};

/** StoreOrder → OrderView del contrato (correo enmascarado; imágenes del archivo de contenido). */
export async function buildOrderView(db: Executor, order: StoreOrder): Promise<OrderView> {
  const items = await listStoreOrderItems(db, order.id);
  const events = await listStoreOrderEvents(db, order.id);
  const settings = await getStoreSettings(db);
  const money = (amount: number): Money => ({ amount, currency: order.currency });
  const point = order.pickupPointId ? settings?.pickupPoints.find((candidate) => candidate.id === order.pickupPointId) : undefined;
  const address = order.deliveryAddress;
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    lines: items.map((item) => {
      // El checkout solo vende productos con contenido; si falta aquí, es un error de despliegue (503 con log).
      const content = getStoreProductContent(item.productSlug);
      if (!content) throw new Error(`Producto sin contenido en content/store-products.ts: ${item.productSlug}`);
      return { name: item.name, image: content.image, quantity: item.quantity, unitPrice: money(item.unitAmount), subtotal: money(item.unitAmount * item.quantity) };
    }),
    subtotal: money(order.subtotalAmount),
    discount: order.discountAmount ? money(order.discountAmount) : null,
    shipping: money(order.shippingAmount),
    total: money(order.totalAmount),
    delivery: {
      method: order.deliveryMethod,
      pickupPoint: point ? { id: point.id, name: point.name, schedule: point.schedule } : null,
      address: address ? { name: address.name, line1: `${address.street}, ${address.neighborhood}`, city: address.city, state: address.state, postalCode: address.postalCode } : null,
    },
    email: maskEmail(order.email),
    shipment: order.carrier && order.trackingNumber ? { carrier: order.carrier, trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, eta: null } : null,
    events: events.flatMap((event): TrackingEvent[] => {
      const visible = VISIBLE_EVENTS[event.type];
      return visible ? [{ at: event.createdAt.toISOString(), status: visible.status, description: visible.description, location: null }] : [];
    }),
  };
}
```

Create `apps/inttimo/src/server/store/confirmation.ts`:

```ts
import { findStoreOrderBySessionId } from "@inttimo/database";
import type { OrderConfirmationResponse } from "../../lib/store/contract.ts";
import { fail, ok, type StoreDeps, type StoreResult } from "./common.ts";
import { buildOrderView } from "./order-view.ts";
import { applyStoreSettlement } from "./settlement.ts";

/**
 * GET /api/tienda/pedido/confirmacion?session_id=… (regreso de Stripe). Nunca marca pagado solo porque el navegador volvió:
 * si el pedido sigue pendiente pregunta a Stripe y aplica la misma liquidación que el webhook.
 */
export async function getOrderConfirmation(deps: Pick<StoreDeps, "db" | "gateway" | "onPaid">, sessionId: string | null): Promise<StoreResult<OrderConfirmationResponse>> {
  if (!sessionId || !/^cs_\w{10,200}$/.test(sessionId)) return fail(400, "validation_error", "El identificador del pago no es válido.");
  let order = await findStoreOrderBySessionId(deps.db, sessionId);
  if (!order) return fail(404, "not_found", "No encontramos tu pedido. Revisa tu correo de confirmación o escríbenos.");

  if (order.paymentStatus === "pending") {
    const pending = order;
    try {
      const snapshot = await deps.gateway.retrieveCheckout(sessionId);
      const settled = await applyStoreSettlement(deps.db, pending, snapshot, "sync", { source: "api", externalRef: snapshot.id });
      if (settled) order = settled.order;
    } catch (error) {
      // Stripe no respondió: se muestra el último estado conocido; el webhook terminará de actualizarlo.
      console.error(JSON.stringify({ level: "warn", msg: "store_confirmation_sync_failed", orderId: pending.id, error: String(error).slice(0, 300) }));
    }
  }
  if (order.paymentStatus === "paid" && !order.confirmationEmailSentAt) await deps.onPaid?.(order.id);
  return ok(await buildOrderView(deps.db, order));
}
```

Create `apps/inttimo/src/app/api/tienda/pedido/confirmacion/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { getOrderConfirmation } from "@/server/store/confirmation";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Pedido al regresar de Stripe (OrderConfirmationResponse). */
export async function GET(request: NextRequest) {
  return storeRoute("store_order_confirmation", async () => storeResponse(await getOrderConfirmation(getStoreDeps(), request.nextUrl.searchParams.get("session_id"))));
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-confirmation.test.ts`
Expected: PASS (5 tests).

Run: `cd apps/inttimo && npx vitest run && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/server/store/order-view.ts apps/inttimo/src/server/store/confirmation.ts apps/inttimo/src/app/api/tienda/pedido apps/inttimo/tests/store-confirmation.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): store order confirmation synced with Stripe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `pnpm store:reconcile` and docs

**Files:**
- Create: `apps/inttimo/src/server/store/reconcile.ts`
- Create: `apps/inttimo/scripts/store-reconcile.ts`
- Modify: `apps/inttimo/package.json`
- Modify: `package.json`
- Modify: `docs/store/BACKEND-PLAN.md`
- Test: `apps/inttimo/tests/store-reconcile.test.ts`

**Interfaces:**
- Consumes: `listUnsettledStoreOrders`, `listStorePaidWithoutConfirmation`, `releaseExpiredStoreOrders` (`@inttimo/database`); `applyStoreSettlement` (Task 8); `sendStoreConfirmationIfNeeded` (Task 7); `createStripeGateway` (`server/presale/gateway.ts`); `arg`, `fail` (`scripts/cli.ts`).
- Produces:
  - `RECONCILE_RELEASE_LIMIT = 1000`
  - `type StoreReconcileReport = { checked: number; updated: { orderNumber: string; paymentStatus: string }[]; released: number; emails: { sent: number; failed: number; exceptions: number }; errors: string[] }`
  - `reconcileStore(deps: { db: Database; gateway: PaymentGateway; send: MailSender; notifyEmail?: string | null }, options: { olderThan: Date; now?: Date }): Promise<StoreReconcileReport>`
  - `pnpm store:reconcile [--older-than=<minutos>]` (root and app)

- [ ] **Step 1: Write the failing test**

Create `apps/inttimo/tests/store-reconcile.test.ts`:

```ts
import { findStoreOrderBySessionId, listStoreOrderEvents, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { reconcileStore } from "../src/server/store/reconcile.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping } from "./helpers.ts";
import { minutesAfter, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let sent: Mail[];
const A = "cs_test_store_000000000001";
const B = "cs_test_store_000000000002";
const send = async (mail: Mail) => void sent.push(mail);

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  sent = [];
  const productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  for (const email of ["ana@ejemplo.com", "beto@ejemplo.com"]) {
    const result = await createStoreCheckout(
      { db, gateway, shipping: new FakeShipping(), siteUrl: "https://inttimo.test", now: () => T0 },
      {
        body: { contact: { fullName: "Cliente Prueba", email }, lines: [{ productId, quantity: 1 }], delivery: { method: "pickup", pickupPointId: "costco" }, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
        idempotencyKey: null,
        clientIp: null,
      },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.body));
  }
});

afterEach(() => close());

/** Dos horas después: la sesión de B (31 min) ya venció con su gracia. */
const run = () => reconcileStore({ db, gateway, send, notifyEmail: "equipo@inttimo.test" }, { olderThan: new Date(Date.now() + 60_000), now: minutesAfter(120) });

describe("reconciliación de la tienda", () => {
  it("aplica pagos sin webhook, libera lo vencido y manda los correos pendientes", async () => {
    gateway.snapshots.set(A, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_a" });
    const a = (await findStoreOrderBySessionId(db, A))!;

    expect(await run()).toEqual({ checked: 2, updated: [{ orderNumber: a.orderNumber, paymentStatus: "paid" }], released: 1, emails: { sent: 1, failed: 0, exceptions: 0 }, errors: [] });
    expect((await findStoreOrderBySessionId(db, B))?.paymentStatus).toBe("cancelled");
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com", "equipo@inttimo.test"]);
    expect((await listStoreOrderEvents(db, a.id)).map((event) => [event.type, event.source])).toContainEqual(["PAYMENT_APPROVED", "cli"]);

    expect(await run()).toMatchObject({ checked: 0, updated: [], released: 0, emails: { sent: 0 } });
  });

  it("un error con un pedido no detiene a los demás", async () => {
    const original = gateway.retrieveCheckout.bind(gateway);
    gateway.retrieveCheckout = async (sessionId: string) => {
      if (sessionId === A) throw new Error("stripe caído");
      return original(sessionId);
    };
    const a = (await findStoreOrderBySessionId(db, A))!;
    const report = await run();
    expect(report.errors).toEqual([`${a.orderNumber}: Error: stripe caído`]);
    expect(report.released).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/inttimo && npx vitest run tests/store-reconcile.test.ts`
Expected: FAIL — `Failed to load url ../src/server/store/reconcile.ts`.

- [ ] **Step 3: Implement**

Create `apps/inttimo/src/server/store/reconcile.ts`:

```ts
import { listStorePaidWithoutConfirmation, listUnsettledStoreOrders, releaseExpiredStoreOrders, type Database } from "@inttimo/database";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { MailSender } from "../presale/notifications.ts";
import { sendStoreConfirmationIfNeeded } from "./notifications.ts";
import { applyStoreSettlement } from "./settlement.ts";

/** Pedidos vencidos que libera, como máximo, cada corrida de `store:reconcile`. */
export const RECONCILE_RELEASE_LIMIT = 1000;

export type StoreReconcileReport = {
  checked: number;
  updated: { orderNumber: string; paymentStatus: string }[];
  released: number;
  emails: { sent: number; failed: number; exceptions: number };
  errors: string[];
};

/**
 * Red de seguridad de la tienda (`pnpm store:reconcile`): 1) consulta a Stripe los pedidos pendientes con sesión y aplica
 * la misma liquidación que el webhook; 2) libera en bloque los apartados vencidos; 3) reintenta los correos pendientes.
 * El orden importa: primero se registra lo que sí se pagó y después se libera lo vencido.
 */
export async function reconcileStore(
  deps: { db: Database; gateway: PaymentGateway; send: MailSender; notifyEmail?: string | null },
  options: { olderThan: Date; now?: Date },
): Promise<StoreReconcileReport> {
  const report: StoreReconcileReport = { checked: 0, updated: [], released: 0, emails: { sent: 0, failed: 0, exceptions: 0 }, errors: [] };

  for (const order of await listUnsettledStoreOrders(deps.db, options.olderThan)) {
    report.checked++;
    try {
      const snapshot = await deps.gateway.retrieveCheckout(order.stripeCheckoutSessionId!);
      const settled = await applyStoreSettlement(deps.db, order, snapshot, "sync", { source: "cli", externalRef: snapshot.id });
      if (settled?.changed) report.updated.push({ orderNumber: settled.order.orderNumber, paymentStatus: settled.order.paymentStatus });
    } catch (error) {
      report.errors.push(`${order.orderNumber}: ${String(error)}`);
    }
  }

  try {
    report.released = await releaseExpiredStoreOrders(deps.db, options.now ?? new Date(), { limit: RECONCILE_RELEASE_LIMIT, source: "cli" });
  } catch (error) {
    report.errors.push(`liberación: ${String(error)}`);
  }

  for (const order of await listStorePaidWithoutConfirmation(deps.db)) {
    const result = await sendStoreConfirmationIfNeeded(deps.db, order.id, { send: deps.send, notifyEmail: deps.notifyEmail });
    if (result === "sent") report.emails.sent++;
    if (result === "failed") report.emails.failed++;
    if (result === "exception") report.emails.exceptions++;
  }

  return report;
}
```

Create `apps/inttimo/scripts/store-reconcile.ts`:

```ts
/**
 * Red de seguridad de la tienda: sincroniza con Stripe los pedidos pendientes, libera en bloque los apartados vencidos y
 * reintenta los correos de pedido pagado.
 *
 *   pnpm store:reconcile                     # pedidos con más de 15 min
 *   pnpm store:reconcile --older-than=60     # minutos
 */
import { createDatabase } from "@inttimo/database";
import { sendMail } from "@inttimo/shared-utils/mail";
import Stripe from "stripe";
import { createStripeGateway } from "../src/server/presale/gateway.ts";
import { reconcileStore } from "../src/server/store/reconcile.ts";
import { arg, fail } from "./cli.ts";

const minutes = Number(arg("older-than") ?? 15);
if (!Number.isFinite(minutes) || minutes < 0) fail("--older-than debe ser un número de minutos.");
const key = process.env.STRIPE_SECRET_KEY ?? fail("STRIPE_SECRET_KEY no está configurada.");

const report = await reconcileStore(
  {
    db: createDatabase(),
    gateway: createStripeGateway(new Stripe(key)),
    send: sendMail,
    notifyEmail: process.env.STORE_NOTIFY_EMAIL || process.env.PRESALE_NOTIFY_EMAIL || null,
  },
  { olderThan: new Date(Date.now() - minutes * 60_000) },
);

console.log(
  `Revisados: ${report.checked} · Actualizados: ${report.updated.length} · Liberados: ${report.released} · Correos enviados: ${report.emails.sent} · Fallidos: ${report.emails.failed} · Incidencias avisadas: ${report.emails.exceptions}`,
);
for (const item of report.updated) console.log(`  ${item.orderNumber} → ${item.paymentStatus}`);
for (const error of report.errors) console.error(`  Error ${error}`);
process.exit(report.errors.length || report.emails.failed ? 1 : 0);
```

In `apps/inttimo/package.json`, after the `"presale:reconcile"` script line add:

```json
    "store:reconcile": "node --env-file-if-exists=../../.env --experimental-strip-types --no-warnings scripts/store-reconcile.ts",
```

In the root `package.json`, after the `"store:seed"` script line add:

```json
    "store:reconcile": "pnpm --filter inttimo store:reconcile",
```

In `docs/store/BACKEND-PLAN.md`:

Replace

```markdown
| 2 | Catálogo y carrito: `GET /api/tienda/productos`, `/productos/[slug]`, `POST /carrito/cotizar` | pendiente |
| 3 | Entrega, envío y código postal: `/entrega`, `/envio/cotizar`, `/codigo-postal/[cp]` | pendiente |
| 4 | Checkout, Stripe y webhook: `/checkout`, `/pedido/confirmacion` | pendiente |
```

with

```markdown
| 2 | Catálogo y carrito: `GET /api/tienda/productos`, `/productos/[slug]`, `POST /carrito/cotizar` | PR A "Vender" ([diseño](./vender-diseno.md), [plan](./vender-plan.md)) |
| 3 | Entrega, envío y código postal: `/entrega`, `/envio/cotizar`, `/codigo-postal/[cp]` | PR A "Vender" |
| 4 | Checkout, Stripe y webhook: `/checkout`, `/pedido/confirmacion`, `pnpm store:reconcile` | PR A "Vender" |
```

Replace

```markdown
- Las tablas existen (debe dar 7): `select count(*) from information_schema.tables where table_name like 'store_%';`
```

with

```markdown
- Las tablas existen (debe dar 9 desde la migración 0012): `select count(*) from information_schema.tables where table_name like 'store_%';`
```

and, at the end of the section "Notas para los siguientes subproyectos", add:

```markdown
- Las notas de los subproyectos 2 y 4 quedan atendidas en PR A (ver [vender-diseno.md](./vender-diseno.md)). Pendiente de decidir: si la tienda limita Stripe a tarjeta (pagos asíncronos como OXXO caen en la ruta de pago tardío).
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/inttimo && npx vitest run tests/store-reconcile.test.ts`
Expected: PASS (2 tests).

Run: `pnpm --filter @inttimo/database test && cd apps/inttimo && npx vitest run`
Expected: all PASS (database and app suites, presale included).

Run: `pnpm --filter @inttimo/database typecheck && pnpm --filter inttimo typecheck && pnpm --filter inttimo lint`
Expected: no errors.

Run: `pnpm --filter inttimo build` only if `DATABASE_URL` points to the local Supabase (`pnpm supabase:start`, port 55322); the build runs `db:deploy` first. Otherwise skip it and report that the build was not verified.

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/server/store/reconcile.ts apps/inttimo/scripts/store-reconcile.ts apps/inttimo/package.json package.json docs/store/BACKEND-PLAN.md apps/inttimo/tests/store-reconcile.test.ts
git commit -m "$(cat <<'EOF'
feat(inttimo): pnpm store:reconcile and PR A status in the backend plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage (decisions 1–15 of the brief):**

| # | Decision | Where |
|---|---|---|
| 1 | Contract untouched | No task edits `contract.ts`/`mock.ts`; missing codes mapped to `validation_error` (Task 6) |
| 2 | `server/store`, `app/api/tienda`, hidden when disabled | Tasks 4–9; `storeRoute` 404 via `flags.ts` (Task 4) |
| 3 | Only `gateway.ts` imports Stripe; store sessions | Task 6 (`createStoreCheckout`, `expireCheckout`, metadata, `client_reference_id`, URLs, 31 min) |
| 4 | Same webhook, routed; amount check; expired; async failed; refunds | Tasks 3 and 8 |
| 5 | `store_settings` + seed from `uno-mas-uno.json`; `confirmation_email_sent_at`; RLS | Task 1 |
| 6 | Catalog/product from DB + content, status mapping | Task 4 |
| 7 | Reading never writes | Task 2 (`getExpiredHeldUnits`), Task 4 (`loadForSale`) |
| 8 | Hardened release | Task 2; bulk release in Task 6 (retry) and Task 10 |
| 9 | Cart quote, max/stock notices, no coupons; checkout coupon 422 | Tasks 4 and 6 |
| 10 | Cart shipping quote reusing presale logic; postal code 404 | Task 5 |
| 11 | Checkout validation, idempotency, error mapping | Task 6 |
| 12 | Confirmation syncs with Stripe, masked email, real events | Task 9 |
| 13 | Emails once, team notice, `STORE_NOTIFY_EMAIL` | Task 7 |
| 14 | `pnpm store:reconcile` | Task 10 |
| 15 | Vitest + PGlite + fakes, TDD, presale green | Every task runs the full app/database suites |

**Interpretations taken (also listed in the spec):** new `store_shipping_quotes` table; amount mismatch keeps the order `pending` with `fulfillment_status = exception` and its hold, excluded from automatic release; paid-oversold orders get only a team notice; 31-minute session; hot-path release of 10 with one bulk-release retry on stock errors; products without a content entry are hidden and not sellable; unknown cart ids are dropped from the quote; the bonus image is not in the store gallery; "Cómo se juega" copied from the simulator as pending; webhook not gated; `cancel_url = /checkout?pago=cancelado`.

**Name consistency check:** `applyStoreSettlement`, `resolveStoreOrder` (Task 8, used in Tasks 9–10); `sendStoreConfirmationIfNeeded`, `confirmStorePaid`, `storeNotifyEmail` (Task 7, used in Tasks 8 and 10); `getExpiredHeldUnits`, `STORE_CHECKOUT_RELEASE_LIMIT` (Task 2); `markStoreCheckoutExpired`, `markStoreOrderPaymentMismatch`, `applyStoreRefund`, `findStoreOrderByPaymentIntent`, `findStoreOrderByIdempotencyKey`, `claimStoreConfirmationEmail`, `releaseStoreConfirmationEmail`, `listStorePaidWithoutConfirmation`, `listUnsettledStoreOrders` (Task 3); `getStoreSettings`, `saveStoreSettings`, `StoreSettingsInput`, `saveStoreShippingQuote`, `getStoreShippingQuote` (Task 1); `StoreDeps`, `StoreResult`, `ok`, `fail`, `zodFieldErrors`, `storeRoute`, `storeResponse`, `readJson`, `getStoreDeps` (Task 4); `STORE_TERMS_VERSION`, `storeShippingAvailable`, `resolveStoreShippingChoice` (Task 5); `CreateStoreCheckoutInput`, `STORE_CHECKOUT_TTL_MINUTES`, `createStoreCheckout` (Task 6). Session ids in tests follow `FakeGateway`: `cs_test_store_<12 digits>`.

**Known limits:** PGlite serializes connections, so concurrent checkouts are tested sequentially (same `FOR UPDATE` design as subproject 1). `pnpm --filter inttimo build` needs a local database and may be skipped. Frontend gaps (cart not cleared after payment in `http` mode; "Pedido confirmado" step shown while payment is pending) belong to the frontend collaborator and are not changed here.
