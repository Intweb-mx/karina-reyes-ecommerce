# Subproyecto 1 — Ordenar el panel de la preventa · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel con bandeja "Por hacer", lista global de pedidos, detalle con un solo "Siguiente paso", y corrección de guía ≠ enviado.

**Architecture:** Capa nueva `apps/inttimo/src/server/admin/` (contrato tipado + reglas puras + consultas) sobre funciones nuevas de `@inttimo/database`. Las pantallas base en `app/panel/(app)/` solo muestran lo que entrega esa capa y reutilizan los componentes de `app/panel/ui.tsx` (PR #18 de Alan).

**Tech Stack:** Next.js App Router (server components + server actions), TypeScript estricto, Drizzle ORM + PostgreSQL (Supabase), PGlite en tests, Vitest, Zod.

**Spec:** [docs/panel-admin/subproyecto-1-diseno.md](./subproyecto-1-diseno.md)

## Global Constraints

- Rama: `feat/panel-por-hacer` (ya existe, rebasada sobre `main` con el PR #18).
- Toda tabla nueva: RLS activado, sin privilegios para `anon`/`authenticated`. El test `todas las tablas de public tienen RLS activo` debe seguir pasando.
- Nunca apuntar migraciones al puerto 54322.
- Textos de UI en español, lenguaje de negocio (sin códigos, JSON ni comandos).
- Guía generada ≠ ENVIADO. ENVIADO, su correo y el bonus solo al presionar "Entregué el paquete a la paquetería" (o al registrar guía hecha por fuera).
- El bonus nunca se reenvía con el correo de reenvío manual; tiene su propio botón.
- Montos en centavos; mostrar con `formatMoney` de `@/lib/format`.
- Comandos de verificación (desde la raíz): `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Commits estilo `feat(inttimo): …` terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Base de datos — notas, búsqueda global y guía con número

**Files:**
- Modify: `packages/database/src/schema/presale.ts` (añadir tabla al final)
- Create: `packages/database/migrations/0009_order_notes.sql` (generada + líneas RLS/trigger)
- Modify: `packages/database/src/presale.ts` (`saveLabel`, nuevas funciones al final)
- Test: `packages/database/tests/orders.test.ts`

**Interfaces:**
- Produces:
  - `saveLabel(db, reservationId, label: { shipmentId: string; labelUrl: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null }): Promise<void>`
  - `type OrderTab = "to_prepare" | "in_transit" | "delivered" | "canceled" | "all"`
  - `type OrderSearch = { query?: string; tab: OrderTab; deliveryMethod?: DeliveryMethod; campaignId?: string; limit: number; offset: number }`
  - `searchAllReservations(db, search: OrderSearch): Promise<{ rows: PresaleReservation[]; total: number; counts: Record<OrderTab, number> }>`
  - `listActionableReservations(db): Promise<PresaleReservation[]>`
  - `listEventsForReservations(db, reservationIds: string[], types: PresaleEventType[]): Promise<{ reservationId: string; type: PresaleEventType; createdAt: Date }[]>`
  - `type OrderNote = { id: string; reservationId: string; body: string; authorEmail: string; createdAt: Date }`
  - `addOrderNote(db, input: { reservationId: string; body: string; authorEmail: string }): Promise<OrderNote>`
  - `listOrderNotes(db, reservationId: string): Promise<OrderNote[]>`

- [ ] **Step 1: Write the failing test**

Crear `packages/database/tests/orders.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  addOrderNote,
  createReservation,
  listOrderNotes,
  markPaid,
  markPaymentFailed,
  markShipped,
  publishTerms,
  saveLabel,
  searchAllReservations,
  upsertCampaign,
  type OrderSearch,
  type PresaleCampaign,
} from "../src/presale.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

async function newCampaign(slug: string) {
  const campaign = await upsertCampaign(db, {
    slug,
    productName: "Producto de prueba",
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2026-01-15T00:00:00Z"),
    unitAmount: 50_000,
    currency: "mxn",
  });
  const terms = await publishTerms(db, campaign.id, "Términos v1", "cli");
  return { campaign, termsId: terms.id };
}

function reservation(c: { campaign: PresaleCampaign; termsId: string }, fullName: string, phone: string | null, deliveryMethod: "shipping" | "pickup" = "shipping") {
  return createReservation(db, {
    campaignId: c.campaign.id,
    fullName,
    email: `${fullName.toLowerCase().replace(/\s/g, ".")}@ejemplo.com`,
    phone,
    quantity: 1,
    unitAmount: c.campaign.unitAmount,
    currency: c.campaign.currency,
    deliveryMethod,
    answers: {},
    termsId: c.termsId,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
  });
}

const search = (s: Partial<OrderSearch>) => searchAllReservations(db, { tab: "all", limit: 50, offset: 0, ...s });
const paid = { source: "stripe" as const };

describe("búsqueda global de pedidos", () => {
  it("encuentra por teléfono y por número de guía", async () => {
    const c = await newCampaign("busqueda");
    const a = await reservation(c, "Laura Gómez", "614 555 0101");
    await reservation(c, "Otro Cliente", "614 000 0000");
    await markPaid(db, a.id, {}, paid);
    await saveLabel(db, a.id, { shipmentId: "shp_9", labelUrl: null, carrier: "Estafeta", trackingNumber: "EST987654", trackingUrl: null });

    expect((await search({ campaignId: c.campaign.id, query: "555 0101" })).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await search({ campaignId: c.campaign.id, query: "est987" })).rows.map((r) => r.id)).toEqual([a.id]);
  });

  it("separa por pestañas, cuenta cada una y filtra por método de entrega", async () => {
    const c = await newCampaign("pestanas");
    const toPrepare = await reservation(c, "Por Preparar", null);
    const inTransit = await reservation(c, "En Camino", null);
    const failed = await reservation(c, "Pago Fallido", null);
    const pickup = await reservation(c, "Para Recoger", null, "pickup");
    await reservation(c, "Sin Pagar", null);
    await markPaid(db, toPrepare.id, {}, paid);
    await markPaid(db, inTransit.id, {}, paid);
    await markShipped(db, inTransit.id, { carrier: "DHL", trackingNumber: "D1", trackingUrl: null }, { source: "panel" });
    await markPaymentFailed(db, failed.id, paid);
    await markPaid(db, pickup.id, {}, paid);

    const result = await search({ campaignId: c.campaign.id, tab: "to_prepare" });
    expect(result.rows.map((r) => r.id).sort()).toEqual([toPrepare.id, pickup.id].sort());
    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ to_prepare: 2, in_transit: 1, delivered: 0, canceled: 1, all: 5 });

    const onlyPickup = await search({ campaignId: c.campaign.id, tab: "to_prepare", deliveryMethod: "pickup" });
    expect(onlyPickup.rows.map((r) => r.id)).toEqual([pickup.id]);
  });
});

describe("notas internas", () => {
  it("se agregan en orden y no se pueden editar ni borrar", async () => {
    const c = await newCampaign("notas");
    const a = await reservation(c, "Con Notas", null);
    await addOrderNote(db, { reservationId: a.id, body: "Llamó para cambiar horario", authorEmail: "karina@inttimo.test" });
    await addOrderNote(db, { reservationId: a.id, body: "Confirmado sábado", authorEmail: "leo@inttimo.test" });

    expect((await listOrderNotes(db, a.id)).map((n) => [n.body, n.authorEmail])).toEqual([
      ["Llamó para cambiar horario", "karina@inttimo.test"],
      ["Confirmado sábado", "leo@inttimo.test"],
    ]);
    await expect(db.execute(sql`update presale_order_notes set body = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from presale_order_notes`)).rejects.toThrow();
    await expect(addOrderNote(db, { reservationId: a.id, body: "", authorEmail: "x" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @inttimo/database test -- orders`
Expected: FAIL — `addOrderNote` / `searchAllReservations` no existen (error de import).

- [ ] **Step 3: Añadir la tabla al esquema**

Al final de `packages/database/src/schema/presale.ts`:

```ts
/** Notas internas del equipo sobre un pedido. Append-only (trigger en la migración 0009). */
export const presaleOrderNotes = pgTable(
  "presale_order_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservationId: uuid()
      .notNull()
      .references(() => presaleReservations.id, { onDelete: "restrict" }),
    body: text().notNull(),
    authorEmail: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("presale_order_notes_reservation_idx").on(table.reservationId, table.createdAt),
    check("presale_order_notes_body_check", sql`char_length(${table.body}) between 1 and 2000`),
  ],
);
```

(`check`, `index`, `sql` y `createdAt` ya están importados en ese archivo; verificar con `head -15`.)

- [ ] **Step 4: Generar la migración y añadir RLS + trigger**

Run: `pnpm --filter @inttimo/database db:generate --name order_notes`
Expected: crea `packages/database/migrations/0009_order_notes.sql` y actualiza `migrations/meta/`.

Añadir al final de `0009_order_notes.sql`:

```sql
--> statement-breakpoint
-- Tabla nueva: RLS activo y sin acceso para anon/authenticated (ver 0004).
ALTER TABLE "presale_order_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "presale_order_notes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'presale_order_notes es append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "presale_order_notes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "presale_order_notes"
  FOR EACH ROW EXECUTE FUNCTION "presale_order_notes_append_only"();
```

- [ ] **Step 5: Implementar las funciones**

En `packages/database/src/presale.ts`:

1. Añadir `presaleOrderNotes` al import de `./schema/presale.ts`.
2. Reemplazar `saveLabel`:

```ts
/** Guía comprada en SkyDropX. Con número de guía queda lista para imprimir; el pedido NO pasa a enviado aquí. */
export async function saveLabel(
  db: Executor,
  reservationId: string,
  label: { shipmentId: string; labelUrl: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null },
): Promise<void> {
  await db.update(presaleReservations).set(label).where(eq(presaleReservations.id, reservationId));
}
```

3. Añadir al final del archivo:

```ts
// ---------- Panel: pedidos de todas las preventas ----------

export type OrderTab = "to_prepare" | "in_transit" | "delivered" | "canceled" | "all";
export type OrderSearch = { query?: string; tab: OrderTab; deliveryMethod?: DeliveryMethod; campaignId?: string; limit: number; offset: number };

const ORDER_TABS: OrderTab[] = ["to_prepare", "in_transit", "delivered", "canceled", "all"];

function orderTabCondition(tab: OrderTab) {
  const paid = inArray(presaleReservations.status, FULFILLABLE);
  switch (tab) {
    case "to_prepare":
      return and(paid, eq(presaleReservations.fulfillmentStatus, "pending"));
    case "in_transit":
      return and(paid, inArray(presaleReservations.fulfillmentStatus, ["shipped", "ready_for_pickup"]));
    case "delivered":
      return and(paid, eq(presaleReservations.fulfillmentStatus, "delivered"));
    case "canceled":
      return inArray(presaleReservations.status, ["refunded", "canceled", "expired", "payment_failed"]);
    case "all":
      return undefined;
  }
}

/** Búsqueda del panel en todas las preventas: nombre, correo, folio, teléfono o número de guía. */
export async function searchAllReservations(db: Executor, search: OrderSearch) {
  const escaped = search.query?.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const base = and(
    search.campaignId ? eq(presaleReservations.campaignId, search.campaignId) : undefined,
    search.deliveryMethod ? eq(presaleReservations.deliveryMethod, search.deliveryMethod) : undefined,
    escaped
      ? or(
          ilike(presaleReservations.code, `%${escaped}%`),
          ilike(presaleReservations.email, `%${escaped}%`),
          ilike(presaleReservations.fullName, `%${escaped}%`),
          ilike(presaleReservations.phone, `%${escaped}%`),
          ilike(presaleReservations.trackingNumber, `%${escaped}%`),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(presaleReservations)
      .where(and(base, orderTabCondition(search.tab)))
      .orderBy(desc(presaleReservations.createdAt))
      .limit(search.limit)
      .offset(search.offset),
    Promise.all(ORDER_TABS.map((tab) => db.select({ value: count() }).from(presaleReservations).where(and(base, orderTabCondition(tab))))),
  ]);
  const counts = Object.fromEntries(ORDER_TABS.map((tab, i) => [tab, totals[i]?.[0]?.value ?? 0])) as Record<OrderTab, number>;
  return { rows, total: counts[search.tab], counts };
}

/** Pedidos que pueden requerir acción: pagados (cualquier estado de entrega) y pagos sin resolver. */
export async function listActionableReservations(db: Executor): Promise<PresaleReservation[]> {
  return db
    .select()
    .from(presaleReservations)
    .where(inArray(presaleReservations.status, ["paid", "partially_refunded", "pending_payment", "processing"]))
    .orderBy(asc(presaleReservations.createdAt));
}

export async function listEventsForReservations(db: Executor, reservationIds: string[], types: PresaleEventType[]) {
  if (!reservationIds.length || !types.length) return [];
  return db
    .select({ reservationId: presaleReservationEvents.reservationId, type: presaleReservationEvents.type, createdAt: presaleReservationEvents.createdAt })
    .from(presaleReservationEvents)
    .where(and(inArray(presaleReservationEvents.reservationId, reservationIds), inArray(presaleReservationEvents.type, types)))
    .orderBy(asc(presaleReservationEvents.createdAt));
}

// ---------- Notas internas ----------

export type OrderNote = typeof presaleOrderNotes.$inferSelect;

export async function addOrderNote(db: Executor, input: { reservationId: string; body: string; authorEmail: string }): Promise<OrderNote> {
  const [row] = await db.insert(presaleOrderNotes).values(input).returning();
  return row!;
}

export async function listOrderNotes(db: Executor, reservationId: string): Promise<OrderNote[]> {
  return db.select().from(presaleOrderNotes).where(eq(presaleOrderNotes.reservationId, reservationId)).orderBy(asc(presaleOrderNotes.createdAt));
}
```

Nota: `FULFILLABLE` está declarado más arriba en el mismo archivo (sección "Cumplimiento"); las funciones nuevas van después, así que ya existe.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @inttimo/database test`
Expected: PASS, incluido `todas las tablas de public tienen RLS activo` en `presale.test.ts`.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @inttimo/database typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add packages/database
git commit -m "feat(inttimo): order notes table and global order search for the panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guía generada ≠ enviado, y "Entregué a la paquetería"

**Files:**
- Modify: `apps/inttimo/src/server/presale/shipping.ts:1-30` (imports) y `generateLabel` (~línea 167 al final de la función)
- Modify: `apps/inttimo/src/server/presale/fulfillment.ts` (nota en metadata + `handToCarrier`)
- Modify: `apps/inttimo/src/app/panel/(app)/reservas/[id]/actions.ts` (`createLabel`; se mueve en Task 6)
- Test: `apps/inttimo/tests/fulfillment.test.ts` (bloque `describe("guía de SkyDropX")`)

**Interfaces:**
- Consumes: `saveLabel` con `carrier`/`trackingNumber`/`trackingUrl` (Task 1).
- Produces:
  - `type LabelResult = { ok: true; status: "ready" | "pending"; message: string } | { ok: false; error: string }`
  - `generateLabel(deps: ShippingDeps, reservationId: string, actor: string): Promise<LabelResult>` (ya no recibe `fulfillment`)
  - `handToCarrier(deps: FulfillmentDeps, reservationId: string, actor: string): Promise<FulfillmentResult>`
  - Los eventos `FULFILLMENT_EMAIL_SENT` / `FULFILLMENT_EMAIL_FAILED` guardan `metadata.note: string | null`.

- [ ] **Step 1: Reescribir los tests de guía (fallan)**

En `apps/inttimo/tests/fulfillment.test.ts`:

1. Añadir `handToCarrier` al import de `../src/server/presale/fulfillment.ts`.
2. Reemplazar el bloque completo `describe("guía de SkyDropX", () => { … });` por:

```ts
describe("guía de SkyDropX", () => {
  const labelDeps = () => ({ db, provider: shipping, now: () => NOW });

  it("compra la guía con la tarifa pagada y la deja lista, sin avisar al cliente", async () => {
    const id = await paidReservation("shipping");
    const result = await generateLabel(labelDeps(), id, "admin@inttimo.test");
    expect(result).toMatchObject({ ok: true, status: "ready" });
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_1", rateId: "rate_eco", to: { postalCode: ADDRESS.postalCode, phone: "6141234567", email: "ana@ejemplo.com" } });
    expect(await findReservationById(db, id)).toMatchObject({
      fulfillmentStatus: "pending",
      carrier: "Estafeta",
      trackingNumber: "GUIA123",
      shipmentId: "shp_1",
      labelUrl: "https://etiquetas.test/1.pdf",
      bonusSentAt: null,
    });
    expect(sent).toHaveLength(0);
    expect(await generateLabel(labelDeps(), id, "admin")).toMatchObject({ ok: false });
    expect(shipping.shipments).toHaveLength(1);
  });

  it("Entregué a la paquetería: marca ENVIADO y manda guía y bonus en un solo correo, una vez", async () => {
    const id = await paidReservation("shipping");
    expect(await handToCarrier(deps, id, "admin")).toEqual({ ok: false, error: "Primero genera la guía." });
    await generateLabel(labelDeps(), id, "admin");

    const result = await handToCarrier(deps, id, "admin@inttimo.test");
    expect(result).toMatchObject({ ok: true, email: "sent", bonus: "sent" });
    expect(await findReservationById(db, id)).toMatchObject({ fulfillmentStatus: "shipped", trackingNumber: "GUIA123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("GUIA123");
    expect(sent[0]!.text).toContain("BONUS DE PREVENTA");
    expect(await handToCarrier(deps, id, "admin")).toEqual({ ok: false, error: "El pedido ya cambió de estado. Recarga la página." });
    expect(sent).toHaveLength(1);
  });

  it("si la guía aún no tiene número, la deja pendiente y la completa al reintentar sin comprar otra", async () => {
    const id = await paidReservation("shipping");
    shipping.tracking = null;
    expect(await generateLabel(labelDeps(), id, "admin")).toMatchObject({ ok: true, status: "pending" });
    expect(await generateLabel(labelDeps(), id, "admin")).toMatchObject({ ok: true, status: "ready" });
    expect(shipping.shipments).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it("con la cotización vencida (más de 23 h) vuelve a cotizar y conserva la misma paquetería", async () => {
    const id = await paidReservation("shipping");
    const later = { ...labelDeps(), now: () => new Date(NOW.getTime() + 30 * 3_600_000) };
    expect((await generateLabel(later, id, "admin")).ok).toBe(true);
    expect(shipping.quotes).toHaveLength(2);
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_2", rateId: "rate_eco" });
  });

  it("no genera guía para recolección ni para pedidos sin pagar; si SkyDropX falla queda en el historial", async () => {
    const pickup = await paidReservation("pickup");
    expect(await generateLabel(labelDeps(), pickup, "admin")).toEqual({ ok: false, error: "Este pedido es con recolección." });
    const id = await paidReservation("shipping");
    shipping.fail = true;
    expect((await generateLabel(labelDeps(), id, "admin")).ok).toBe(false);
    expect((await listReservationEvents(db, id)).map((e) => e.type)).toContain("LABEL_FAILED");
  });
});
```

3. En el test existente `"recolección: listo para recoger avisa con la nota y libera el bonus una sola vez"`, añadir al final:

```ts
    const emailEvent = (await listReservationEvents(db, id)).find((e) => e.type === "FULFILLMENT_EMAIL_SENT");
    expect(emailEvent?.metadata).toMatchObject({ note: "Costco Juventud, sábado 10:00–13:00" });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter inttimo test -- fulfillment`
Expected: FAIL — `handToCarrier` no existe; `status` es `"shipped"` en vez de `"ready"`; falta `note` en metadata.

- [ ] **Step 3: Guardar la nota en los eventos de correo de entrega**

En `apps/inttimo/src/server/presale/fulfillment.ts`, dentro de `fulfillReservation`, después de `if (action.type === "delivered") return …;` añadir:

```ts
  const note = action.note?.trim() || null;
```

y usarla en las dos llamadas a `addReservationEvent` de correo y en el envío:

```ts
    await deps.send(fulfillmentMail(updated, campaign?.productName ?? "inttimo", note, point, bonusInfo));
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: updated.fulfillmentStatus, bonusIncluded: !!bonusInfo, note } });
```

```ts
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { error: String(error).slice(0, 300), note } });
```

- [ ] **Step 4: Añadir `handToCarrier`**

En `fulfillment.ts`, después de `fulfillReservation`:

```ts
/**
 * Envío: Karina entregó el paquete a la paquetería. Usa la guía ya generada en el panel; marca ENVIADO,
 * avisa al cliente con su número de guía y libera el bonus (regla de Karina, 2026-10-02: guía generada ≠ enviado).
 */
export async function handToCarrier(deps: FulfillmentDeps, reservationId: string, actor: string): Promise<FulfillmentResult> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation) return { ok: false, error: "Pedido no encontrado." };
  if (!reservation.trackingNumber || !reservation.carrier) return { ok: false, error: "Primero genera la guía." };
  return fulfillReservation(
    deps,
    reservationId,
    {
      type: "shipped",
      shipment: {
        carrier: reservation.carrier,
        trackingNumber: reservation.trackingNumber,
        trackingUrl: reservation.trackingUrl,
        shipmentId: reservation.shipmentId,
        labelUrl: reservation.labelUrl,
      },
    },
    actor,
  );
}
```

Nota: si el pedido ya está `shipped`, `markShipped` devuelve null y `fulfillReservation` responde "El pedido ya cambió de estado. Recarga la página." — no hace falta otra validación.

- [ ] **Step 5: `generateLabel` ya no marca ENVIADO**

En `apps/inttimo/src/server/presale/shipping.ts`:

1. Borrar el import `import { fulfillReservation, type FulfillmentDeps } from "./fulfillment.ts";`.
2. Cambiar el tipo y la documentación:

```ts
export type LabelResult = { ok: true; status: "ready" | "pending"; message: string } | { ok: false; error: string };

/**
 * Compra la guía en SkyDropX para un pedido pagado con envío y guarda paquetería y número de guía. El pedido sigue
 * EN PREPARACIÓN: pasa a ENVIADO (correo + bonus) solo con `handToCarrier`, cuando el paquete se entrega a la paquetería.
 * Si la cotización tiene más de 23 h se vuelve a cotizar y se elige la misma paquetería y servicio (o la más económica);
 * la diferencia la absorbe inttimo, el cliente ya pagó.
 */
export async function generateLabel(deps: ShippingDeps, reservationId: string, actor: string): Promise<LabelResult> {
```

3. Justo después de la validación `if (reservation.fulfillmentStatus !== "pending") …`, añadir:

```ts
  if (reservation.trackingNumber) return { ok: false, error: "La guía ya está generada: imprímela y avisa cuando la entregues a la paquetería." };
```

4. Reemplazar todo lo que va después del bloque `try { … } catch { … }` hasta el final de la función por:

```ts
  if (!shipment.trackingNumber) {
    if (shipment.labelUrl && shipment.labelUrl !== reservation.labelUrl) await saveLabel(deps.db, reservation.id, { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl });
    return { ok: true, status: "pending", message: "SkyDropX está generando la guía. Vuelve a presionar en unos minutos para traer el número de guía." };
  }

  await saveLabel(deps.db, reservation.id, {
    shipmentId: shipment.shipmentId,
    labelUrl: shipment.labelUrl,
    carrier: shipment.carrier ?? reservation.shippingSelection?.carrier ?? "Paquetería",
    trackingNumber: shipment.trackingNumber,
    trackingUrl: null,
  });
  return {
    ok: true,
    status: "ready",
    message: `Guía ${shipment.trackingNumber} lista. Imprímela y pégala en la caja; cuando entregues el paquete a la paquetería, presiona “Entregué el paquete a la paquetería”.`,
  };
}
```

- [ ] **Step 6: Ajustar la acción del panel**

En `apps/inttimo/src/app/panel/(app)/reservas/[id]/actions.ts`, dentro de `createLabel`:

```ts
  const result = await generateLabel(getShippingDeps(), reservationId, state.admin.email);
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter inttimo test -- fulfillment`
Expected: PASS.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores. Si `grep -rn "generateLabel(" apps/inttimo/src apps/inttimo/scripts` muestra otra llamada con `fulfillment:`, quitar esa propiedad.

- [ ] **Step 9: Commit**

```bash
git add apps/inttimo/src/server/presale apps/inttimo/src/app/panel apps/inttimo/tests/fulfillment.test.ts
git commit -m "fix(inttimo): generating a label no longer marks the order shipped

Karina's rule: label generated != shipped. The shipped email and bonus now go out
only when she confirms the package was handed to the carrier (handToCarrier).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reenviar correos desde el panel

**Files:**
- Modify: `apps/inttimo/src/server/presale/notifications.ts` (`resendConfirmation`)
- Modify: `apps/inttimo/src/server/presale/fulfillment.ts` (`resendFulfillmentEmail`)
- Test: `apps/inttimo/tests/fulfillment.test.ts` (nuevo `describe`)

**Interfaces:**
- Consumes: metadata `note` en eventos de correo de entrega (Task 2).
- Produces:
  - `resendConfirmation(db: Database, reservationId: string, deps: { send: MailSender }): Promise<"sent" | "failed" | "not_paid">`
  - `resendFulfillmentEmail(deps: FulfillmentDeps, reservationId: string): Promise<"sent" | "failed" | "not_applicable">`

- [ ] **Step 1: Write the failing test**

En `apps/inttimo/tests/fulfillment.test.ts`, añadir `resendFulfillmentEmail` al import de `fulfillment.ts`, añadir `import { resendConfirmation } from "../src/server/presale/notifications.ts";` y este bloque al final del archivo:

```ts
describe("reenviar correos", () => {
  it("reenvía el aviso de listo para recoger con la misma nota y sin bonus", async () => {
    const id = await paidReservation("pickup");
    expect(await resendFulfillmentEmail(deps, id)).toBe("not_applicable");
    await fulfillReservation(deps, id, { type: "ready_for_pickup", note: "Sábado 10:00" }, "admin");
    sent = [];

    expect(await resendFulfillmentEmail(deps, id)).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Sábado 10:00");
    expect(sent[0]!.text).not.toContain("BONUS DE PREVENTA");
  });

  it("si el reenvío falla queda en el historial", async () => {
    const id = await paidReservation("pickup");
    await fulfillReservation(deps, id, { type: "ready_for_pickup", note: null }, "admin");
    failMail = true;
    expect(await resendFulfillmentEmail(deps, id)).toBe("failed");
    expect((await listReservationEvents(db, id)).map((e) => e.type).at(-1)).toBe("FULFILLMENT_EMAIL_FAILED");
  });

  it("reenvía la confirmación de pago aunque ya se haya enviado; no aplica a pedidos sin pagar", async () => {
    const id = await paidReservation("pickup");
    const send = deps.send;
    expect(await resendConfirmation(db, id, { send })).toBe("sent");
    expect((await findReservationById(db, id))?.confirmationEmailSentAt).not.toBeNull();
    expect(await resendConfirmation(db, id, { send })).toBe("sent");
    expect(sent.filter((m) => m.to === "ana@ejemplo.com")).toHaveLength(2);

    await db.execute(`update presale_reservations set status = 'refunded' where id = '${id}'`);
    expect(await resendConfirmation(db, id, { send })).toBe("not_paid");
  });
});
```

Nota: `paidReservation` ya marca el pedido como pagado sin enviar confirmación (llama a `markPaid` directamente), así que el primer `resendConfirmation` hace el envío normal y el segundo es el reenvío forzado.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter inttimo test -- fulfillment`
Expected: FAIL — `resendFulfillmentEmail` / `resendConfirmation` no existen.

- [ ] **Step 3: Implementar `resendConfirmation`**

En `apps/inttimo/src/server/presale/notifications.ts`, añadir `findReservationById` al import de `@inttimo/database` y, después de `sendConfirmationIfNeeded`:

```ts
/**
 * Reenvío manual desde el panel. Si la confirmación nunca salió, hace el envío normal (y la marca como enviada);
 * si ya salió, la manda otra vez y lo deja en el historial.
 */
export async function resendConfirmation(db: Database, reservationId: string, deps: { send: MailSender }): Promise<"sent" | "failed" | "not_paid"> {
  const reservation = await findReservationById(db, reservationId);
  if (!reservation || (reservation.status !== "paid" && reservation.status !== "partially_refunded")) return "not_paid";
  const first = await sendConfirmationIfNeeded(db, reservationId, deps);
  if (first !== "skipped") return first;

  const campaign = await getCampaignById(db, reservation.campaignId);
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);
  try {
    await deps.send(customerMail(reservation, campaign?.productName ?? "inttimo", point));
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_SENT", "panel", { metadata: { manual: true } });
    return "sent";
  } catch (error) {
    await addReservationEvent(db, reservation.id, "CONFIRMATION_EMAIL_FAILED", "panel", { metadata: { manual: true, error: String(error).slice(0, 300) } });
    return "failed";
  }
}
```

(`customerMail` es la función interna del mismo archivo que usa `sendConfirmationIfNeeded`; verificar el nombre con `grep -n "function customerMail" notifications.ts`.)

- [ ] **Step 4: Implementar `resendFulfillmentEmail`**

En `fulfillment.ts`, añadir `listReservationEvents` al import de `@inttimo/database` y, después de `handToCarrier`:

```ts
/** Reenvío manual del aviso de ENVIADO / LISTO PARA RECOGER, con la misma nota y SIN bonus (el bonus tiene su propio reintento). */
export async function resendFulfillmentEmail(deps: FulfillmentDeps, reservationId: string): Promise<"sent" | "failed" | "not_applicable"> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation || (reservation.fulfillmentStatus !== "shipped" && reservation.fulfillmentStatus !== "ready_for_pickup")) return "not_applicable";
  const campaign = await getCampaignById(deps.db, reservation.campaignId);
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);
  const events = await listReservationEvents(deps.db, reservation.id);
  const previous = [...events].reverse().find((e) => (e.type === "FULFILLMENT_EMAIL_SENT" || e.type === "FULFILLMENT_EMAIL_FAILED") && typeof e.metadata.note === "string");
  const note = (previous?.metadata.note as string | undefined) ?? null;

  try {
    await deps.send(fulfillmentMail(reservation, campaign?.productName ?? "inttimo", note, point, null));
    await addReservationEvent(deps.db, reservation.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: reservation.fulfillmentStatus, bonusIncluded: false, manual: true, note } });
    return "sent";
  } catch (error) {
    await addReservationEvent(deps.db, reservation.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { manual: true, error: String(error).slice(0, 300), note } });
    return "failed";
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter inttimo test`
Expected: PASS (toda la suite de la app).

- [ ] **Step 6: Commit**

```bash
git add apps/inttimo/src/server/presale apps/inttimo/tests/fulfillment.test.ts
git commit -m "feat(inttimo): resend confirmation and delivery emails from the panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contrato y reglas puras (siguiente paso e incidencias)

**Files:**
- Create: `apps/inttimo/src/server/admin/contract.ts`
- Create: `apps/inttimo/src/server/admin/next-step.ts`
- Create: `apps/inttimo/src/server/admin/incidents.ts`
- Test: `apps/inttimo/tests/admin-rules.test.ts`

**Interfaces:**
- Produces (en `contract.ts`, sin código de servidor: se puede importar desde componentes cliente):
  - `NextStep`, `IncidentType`, `INCIDENT_LABELS`, `ORDER_TABS`, `OrderTab`, `ORDER_TAB_LABELS`, `OrderSummary`, `Inbox`, `OrderQuery`, `OrderList`, `AnswerRow`, `OrderDetail`
- Produces (funciones puras):
  - `nextStepFor(order: NextStepInput): NextStep`
  - `incidentsFor(order: IncidentInput, events: { type: string; createdAt: Date }[], now: Date): IncidentType[]`
  - `INCIDENT_EVENT_TYPES: PresaleEventType[]`

- [ ] **Step 1: Crear `contract.ts`**

```ts
/**
 * Contrato entre el backend del panel (`server/admin/*`) y sus pantallas (`app/panel/**`).
 * Solo tipos y constantes: se puede importar desde componentes de cliente. Las pantallas no consultan la base directamente.
 */
import type { DeliveryMethod, FulfillmentStatus, ReservationStatus } from "@inttimo/database";

/** El único paso que toca hacer con un pedido. Lo decide el servidor (`nextStepFor`). */
export type NextStep =
  | { type: "not_paid" }
  /** `blocked`: sin dirección no se puede comprar la guía. `inProgress`: SkyDropX aún no devuelve el número de guía. */
  | { type: "generate_label"; blocked: "missing_address" | null; inProgress: boolean }
  | { type: "hand_to_carrier" }
  | { type: "mark_delivered" }
  | { type: "notify_ready" }
  | { type: "mark_picked_up" }
  | { type: "none" };

export type IncidentType = "label_failed" | "confirmation_email_failed" | "fulfillment_email_failed" | "bonus_failed" | "payment_unsettled" | "missing_address";

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  label_failed: "No se pudo generar la guía",
  confirmation_email_failed: "No le llegó el correo de confirmación",
  fulfillment_email_failed: "No le llegó el aviso de envío o recolección",
  bonus_failed: "No le llegó el bonus",
  payment_unsettled: "Pago sin confirmar desde hace más de un día",
  missing_address: "Falta la dirección de envío",
};

export const ORDER_TABS = ["to_prepare", "in_transit", "delivered", "canceled", "all"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const ORDER_TAB_LABELS: Record<OrderTab, string> = {
  to_prepare: "Por preparar",
  in_transit: "Enviados o listos",
  delivered: "Entregados",
  canceled: "Cancelados y reembolsados",
  all: "Todos",
};

export type OrderSummary = {
  id: string;
  code: string;
  fullName: string;
  email: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  status: ReservationStatus;
  deliveryMethod: DeliveryMethod;
  fulfillmentStatus: FulfillmentStatus;
  campaignName: string;
  createdAt: Date;
  paidAt: Date | null;
};

export type Inbox = {
  toLabel: OrderSummary[];
  toHandOver: OrderSummary[];
  toNotify: OrderSummary[];
  awaitingPickup: (OrderSummary & { waitingDays: number })[];
  incidents: (OrderSummary & { incident: IncidentType })[];
};

export type OrderQuery = { q?: string; tab: OrderTab; deliveryMethod?: DeliveryMethod; campaignId?: string; page: number };

export type OrderList = {
  rows: OrderSummary[];
  total: number;
  counts: Record<OrderTab, number>;
  page: number;
  pages: number;
  campaigns: { id: string; slug: string; productName: string }[];
};

export type AnswerRow = { label: string; value: string };

export type OrderDetail = {
  id: string;
  code: string;
  campaign: { slug: string; productName: string } | null;
  customer: { fullName: string; email: string; phone: string | null; marketingConsent: boolean };
  payment: {
    status: ReservationStatus;
    quantity: number;
    unitAmount: number;
    shippingAmount: number;
    totalAmount: number;
    amountRefunded: number;
    currency: string;
    createdAt: Date;
    paidAt: Date | null;
    termsVersion: number | null;
    stripeUrl: string | null;
  };
  delivery: {
    method: DeliveryMethod;
    status: FulfillmentStatus;
    pickupPoint: { name: string; schedule: string } | null;
    /** Líneas listas para mostrar; null si no hay dirección. */
    address: string[] | null;
    /** Paquetería que eligió el cliente, p. ej. "Estafeta Terrestre · 5 días". */
    selection: string | null;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    labelUrl: string | null;
    fulfilledAt: Date | null;
    deliveredAt: Date | null;
  };
  bonus: { configured: boolean; sentAt: Date | null };
  nextStep: NextStep;
  incidents: IncidentType[];
  answers: AnswerRow[];
  postPurchase: AnswerRow[] | null;
  notes: { id: string; body: string; authorEmail: string; createdAt: Date }[];
  /** `type` es el tipo de evento; la pantalla lo traduce con EVENT_LABELS. */
  timeline: { id: string; at: Date; type: string; failed: boolean }[];
};
```

- [ ] **Step 2: Write the failing test**

Crear `apps/inttimo/tests/admin-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { incidentsFor } from "../src/server/admin/incidents.ts";
import { nextStepFor } from "../src/server/admin/next-step.ts";
import { NOW } from "./helpers.ts";

type Order = Parameters<typeof incidentsFor>[0] & Parameters<typeof nextStepFor>[0];

const ADDRESS = { name: "Ana", phone: "6141234567", street: "Calle 1", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", reference: null };

const base: Order = {
  status: "paid",
  deliveryMethod: "shipping",
  fulfillmentStatus: "pending",
  trackingNumber: null,
  shipmentId: null,
  deliveryAddress: ADDRESS,
  paidAt: NOW,
  confirmationEmailSentAt: NOW,
  bonusSentAt: null,
  stripeCheckoutSessionId: "cs_1",
  createdAt: NOW,
};
const order = (overrides: Partial<Order> = {}): Order => ({ ...base, ...overrides });
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const ev = (type: string, minutes: number) => ({ type, createdAt: at(minutes) });

describe("siguiente paso", () => {
  it.each([
    ["sin pagar", order({ status: "pending_payment" }), { type: "not_paid" }],
    ["reembolsado", order({ status: "refunded" }), { type: "not_paid" }],
    ["envío sin guía", order(), { type: "generate_label", blocked: null, inProgress: false }],
    ["guía en proceso", order({ shipmentId: "shp_1" }), { type: "generate_label", blocked: null, inProgress: true }],
    ["sin dirección", order({ deliveryAddress: null }), { type: "generate_label", blocked: "missing_address", inProgress: false }],
    ["guía lista", order({ trackingNumber: "G1", shipmentId: "shp_1" }), { type: "hand_to_carrier" }],
    ["enviado", order({ fulfillmentStatus: "shipped", trackingNumber: "G1" }), { type: "mark_delivered" }],
    ["enviado con reembolso parcial", order({ status: "partially_refunded", fulfillmentStatus: "shipped" }), { type: "mark_delivered" }],
    ["recolección por preparar", order({ deliveryMethod: "pickup", deliveryAddress: null }), { type: "notify_ready" }],
    ["recolección avisada", order({ deliveryMethod: "pickup", fulfillmentStatus: "ready_for_pickup" }), { type: "mark_picked_up" }],
    ["entregado", order({ fulfillmentStatus: "delivered" }), { type: "none" }],
  ])("%s", (_name, input, expected) => {
    expect(nextStepFor(input)).toEqual(expected);
  });
});

describe("incidencias", () => {
  it("un pedido sin problemas no tiene incidencias", () => {
    expect(incidentsFor(order(), [], at(60))).toEqual([]);
  });

  it("guía fallida hasta que se genera una nueva o el pedido avanza", () => {
    expect(incidentsFor(order(), [ev("LABEL_FAILED", 1)], at(60))).toEqual(["label_failed"]);
    expect(incidentsFor(order(), [ev("LABEL_FAILED", 1), ev("LABEL_CREATED", 2)], at(60))).toEqual([]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("LABEL_FAILED", 1)], at(60))).toEqual([]);
  });

  it("confirmación sin enviar después de 15 minutos del pago", () => {
    expect(incidentsFor(order({ confirmationEmailSentAt: null }), [], at(5))).toEqual([]);
    expect(incidentsFor(order({ confirmationEmailSentAt: null }), [], at(20))).toEqual(["confirmation_email_failed"]);
  });

  it("aviso de entrega fallido hasta que uno posterior sale bien", () => {
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("FULFILLMENT_EMAIL_FAILED", 1)], at(60))).toEqual(["fulfillment_email_failed"]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("FULFILLMENT_EMAIL_FAILED", 1), ev("FULFILLMENT_EMAIL_SENT", 2)], at(60))).toEqual([]);
  });

  it("bonus fallido mientras no se haya enviado", () => {
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("BONUS_FAILED", 1)], at(60))).toEqual(["bonus_failed"]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped", bonusSentAt: at(3) }), [ev("BONUS_FAILED", 1)], at(60))).toEqual([]);
  });

  it("envío pagado sin dirección", () => {
    expect(incidentsFor(order({ deliveryAddress: null }), [], at(60))).toEqual(["missing_address"]);
    expect(incidentsFor(order({ deliveryMethod: "pickup", deliveryAddress: null }), [], at(60))).toEqual([]);
  });

  it("pago sin resolver por más de un día con sesión de Stripe", () => {
    const unpaid = order({ status: "pending_payment", paidAt: null, confirmationEmailSentAt: null });
    expect(incidentsFor(unpaid, [], at(25 * 60))).toEqual(["payment_unsettled"]);
    expect(incidentsFor(unpaid, [], at(2 * 60))).toEqual([]);
    expect(incidentsFor({ ...unpaid, stripeCheckoutSessionId: null }, [], at(25 * 60))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter inttimo test -- admin-rules`
Expected: FAIL — no existen `next-step.ts` / `incidents.ts`.

- [ ] **Step 4: Implementar `next-step.ts`**

```ts
import type { PresaleReservation } from "@inttimo/database";
import type { NextStep } from "./contract.ts";

export type NextStepInput = Pick<PresaleReservation, "status" | "deliveryMethod" | "fulfillmentStatus" | "trackingNumber" | "shipmentId" | "deliveryAddress">;

/** Siguiente paso de un pedido (ver tabla en docs/panel-admin/subproyecto-1-diseno.md §2.1). */
export function nextStepFor(order: NextStepInput): NextStep {
  if (order.status !== "paid" && order.status !== "partially_refunded") return { type: "not_paid" };
  if (order.fulfillmentStatus === "delivered") return { type: "none" };
  if (order.deliveryMethod === "shipping") {
    if (order.fulfillmentStatus === "shipped") return { type: "mark_delivered" };
    if (order.trackingNumber) return { type: "hand_to_carrier" };
    return { type: "generate_label", blocked: order.deliveryAddress ? null : "missing_address", inProgress: !!order.shipmentId };
  }
  return order.fulfillmentStatus === "ready_for_pickup" ? { type: "mark_picked_up" } : { type: "notify_ready" };
}
```

- [ ] **Step 5: Implementar `incidents.ts`**

```ts
import type { PresaleEventType, PresaleReservation } from "@inttimo/database";
import type { IncidentType } from "./contract.ts";

export type IncidentInput = Pick<
  PresaleReservation,
  "status" | "deliveryMethod" | "fulfillmentStatus" | "deliveryAddress" | "paidAt" | "confirmationEmailSentAt" | "bonusSentAt" | "stripeCheckoutSessionId" | "createdAt"
>;
type IncidentEvent = { type: string; createdAt: Date };

/** Eventos que hacen falta para calcular incidencias (para no traer el historial completo de cada pedido). */
export const INCIDENT_EVENT_TYPES: PresaleEventType[] = ["LABEL_CREATED", "LABEL_FAILED", "FULFILLMENT_EMAIL_SENT", "FULFILLMENT_EMAIL_FAILED", "BONUS_SENT", "BONUS_FAILED"];

const CONFIRMATION_GRACE_MS = 15 * 60_000;
const UNSETTLED_MS = 24 * 3_600_000;

/** Último evento (los eventos vienen del más antiguo al más reciente) de entre `types`. */
function last(events: IncidentEvent[], types: string[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (types.includes(events[i]!.type)) return events[i]!.type;
  return null;
}

/** Problemas abiertos de un pedido. Se calculan, no se guardan: desaparecen cuando un evento posterior los resuelve. */
export function incidentsFor(order: IncidentInput, events: IncidentEvent[], now: Date): IncidentType[] {
  const incidents: IncidentType[] = [];
  if (order.status === "paid" || order.status === "partially_refunded") {
    if (order.fulfillmentStatus === "pending" && last(events, ["LABEL_CREATED", "LABEL_FAILED"]) === "LABEL_FAILED") incidents.push("label_failed");
    if (!order.confirmationEmailSentAt && order.paidAt && now.getTime() - order.paidAt.getTime() > CONFIRMATION_GRACE_MS) incidents.push("confirmation_email_failed");
    if (last(events, ["FULFILLMENT_EMAIL_SENT", "FULFILLMENT_EMAIL_FAILED"]) === "FULFILLMENT_EMAIL_FAILED") incidents.push("fulfillment_email_failed");
    if (!order.bonusSentAt && last(events, ["BONUS_SENT", "BONUS_FAILED"]) === "BONUS_FAILED") incidents.push("bonus_failed");
    if (order.deliveryMethod === "shipping" && order.fulfillmentStatus === "pending" && !order.deliveryAddress) incidents.push("missing_address");
  } else if ((order.status === "pending_payment" || order.status === "processing") && order.stripeCheckoutSessionId && now.getTime() - order.createdAt.getTime() > UNSETTLED_MS) {
    incidents.push("payment_unsettled");
  }
  return incidents;
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter inttimo test -- admin-rules`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/inttimo/src/server/admin apps/inttimo/tests/admin-rules.test.ts
git commit -m "feat(inttimo): admin panel contract, next-step and incident rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Consultas del panel — bandeja, lista y detalle

**Files:**
- Create: `apps/inttimo/src/server/admin/orders.ts`
- Create: `apps/inttimo/src/server/admin/inbox.ts`
- Test: `apps/inttimo/tests/admin-orders.test.ts`

**Interfaces:**
- Consumes: Task 1 (`searchAllReservations`, `listActionableReservations`, `listEventsForReservations`, `listOrderNotes`), Task 4 (contrato, `nextStepFor`, `incidentsFor`, `INCIDENT_EVENT_TYPES`).
- Produces:
  - `ORDERS_PAGE_SIZE = 50`
  - `toOrderSummary(r: PresaleReservation, campaignNames: Map<string, string>): OrderSummary`
  - `parseOrderQuery(params: Record<string, string | string[] | undefined>): OrderQuery`
  - `searchOrders(db: Database, query: OrderQuery): Promise<OrderList>`
  - `getOrderDetail(db: Database, id: string, now?: Date): Promise<OrderDetail | null>`
  - `getInbox(db: Database, now?: Date): Promise<Inbox>`

- [ ] **Step 1: Write the failing test**

Crear `apps/inttimo/tests/admin-orders.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { addOrderNote, createReservation, getCurrentTerms, markPaid, markReadyForPickup, saveLabel, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInbox } from "../src/server/admin/inbox.ts";
import { getOrderDetail, parseOrderQuery, searchOrders } from "../src/server/admin/orders.ts";
import { ADDRESS, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let campaignId: string;
let termsId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  const campaign = await seedCampaign(db);
  campaignId = campaign.id;
  termsId = (await getCurrentTerms(db, campaign.id))!.id;
});

afterEach(() => close());

async function order({ method = "shipping", address = true, paid = true, phone = "6141234567" }: { method?: "shipping" | "pickup"; address?: boolean; paid?: boolean; phone?: string } = {}) {
  const r = await createReservation(db, {
    campaignId,
    fullName: "Ana Pérez",
    email: "ana@ejemplo.com",
    phone,
    quantity: 1,
    unitAmount: 99_900,
    currency: "mxn",
    deliveryMethod: method,
    pickupPointId: method === "pickup" ? "costco" : null,
    deliveryAddress: method === "shipping" && address ? { name: "Ana Pérez", phone, ...ADDRESS } : null,
    answers: VALID_ANSWERS,
    termsId,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
  });
  if (paid) await markPaid(db, r.id, {}, { source: "stripe" });
  return r.id;
}

describe("Por hacer", () => {
  it("reparte los pedidos pagados según su siguiente paso", async () => {
    const toLabel = await order();
    const toHandOver = await order();
    await saveLabel(db, toHandOver, { shipmentId: "shp_1", labelUrl: "https://etiquetas.test/1.pdf", carrier: "Estafeta", trackingNumber: "GUIA1", trackingUrl: null });
    const toNotify = await order({ method: "pickup" });
    const waiting = await order({ method: "pickup" });
    await markReadyForPickup(db, waiting, { source: "panel" });
    await order({ paid: false });

    const inbox = await getInbox(db, new Date());
    expect(inbox.toLabel.map((o) => o.id)).toEqual([toLabel]);
    expect(inbox.toLabel[0]).toMatchObject({ campaignName: "UNO+UNO", fullName: "Ana Pérez" });
    expect(inbox.toHandOver.map((o) => o.id)).toEqual([toHandOver]);
    expect(inbox.toNotify.map((o) => o.id)).toEqual([toNotify]);
    expect(inbox.awaitingPickup).toMatchObject([{ id: waiting, waitingDays: 0 }]);
    expect(inbox.incidents).toEqual([]);
  });

  it("muestra incidencias: sin dirección y confirmación sin enviar", async () => {
    const noAddress = await order({ address: false });
    const inbox = await getInbox(db, new Date(Date.now() + 20 * 60_000));
    expect(inbox.incidents.filter((i) => i.id === noAddress).map((i) => i.incident).sort()).toEqual(["confirmation_email_failed", "missing_address"]);
  });
});

describe("Pedidos", () => {
  it("interpreta los filtros de la URL y descarta valores inválidos", () => {
    expect(parseOrderQuery({})).toEqual({ tab: "to_prepare", page: 1 });
    expect(parseOrderQuery({ tab: "x", entrega: "pickup", campana: "no-es-uuid", pagina: "3", q: "  ana " })).toEqual({ tab: "to_prepare", deliveryMethod: "pickup", page: 3, q: "ana" });
    expect(parseOrderQuery({ tab: "all", campana: campaignId })).toEqual({ tab: "all", campaignId, page: 1 });
  });

  it("busca en todas las preventas por teléfono", async () => {
    const id = await order({ phone: "6149998877" });
    await order();
    const list = await searchOrders(db, { q: "9998877", tab: "all", page: 1 });
    expect(list.rows.map((r) => r.id)).toEqual([id]);
    expect(list).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(list.campaigns.map((c) => c.slug)).toContain("uno-mas-uno");
  });

  it("arma el detalle con siguiente paso, dirección, respuestas, notas e historial", async () => {
    const id = await order();
    await addOrderNote(db, { reservationId: id, body: "Pidió envío rápido", authorEmail: "karina@inttimo.test" });

    const detail = await getOrderDetail(db, id);
    expect(detail?.nextStep).toEqual({ type: "generate_label", blocked: null, inProgress: false });
    expect(detail?.delivery.address).toContain(`${ADDRESS.street}, ${ADDRESS.neighborhood}`);
    expect(detail?.answers).toContainEqual({ label: "¿Cómo nos conociste?", value: "Redes" });
    expect(detail?.notes.map((n) => n.body)).toEqual(["Pidió envío rápido"]);
    expect(detail?.timeline.map((e) => e.type)).toEqual(expect.arrayContaining(["RESERVATION_CREATED", "PAYMENT_APPROVED"]));
    expect(detail?.payment.termsVersion).toBe(1);
    expect(await getOrderDetail(db, randomUUID())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter inttimo test -- admin-orders`
Expected: FAIL — no existen `inbox.ts` / `orders.ts`.

- [ ] **Step 3: Implementar `orders.ts`**

```ts
import "server-only";
import {
  findReservationById,
  getCampaignById,
  getPostPurchaseAnswers,
  getTermsById,
  listCampaigns,
  listOrderNotes,
  listReservationEvents,
  searchAllReservations,
  type Database,
  type PresaleReservation,
} from "@inttimo/database";
import { postPurchaseCopy } from "@/content/presale";
import { ORDER_TABS, type AnswerRow, type OrderDetail, type OrderList, type OrderQuery, type OrderSummary, type OrderTab } from "./contract.ts";
import { incidentsFor } from "./incidents.ts";
import { nextStepFor } from "./next-step.ts";

export const ORDERS_PAGE_SIZE = 50;

export function toOrderSummary(r: PresaleReservation, campaignNames: Map<string, string>): OrderSummary {
  return {
    id: r.id,
    code: r.code,
    fullName: r.fullName,
    email: r.email,
    quantity: r.quantity,
    totalAmount: r.totalAmount,
    currency: r.currency,
    status: r.status,
    deliveryMethod: r.deliveryMethod,
    fulfillmentStatus: r.fulfillmentStatus,
    campaignName: campaignNames.get(r.campaignId) ?? "",
    createdAt: r.createdAt,
    paidAt: r.paidAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros de la lista de pedidos a partir de la URL (?tab, q, entrega, campana, pagina). Lo inválido se descarta. */
export function parseOrderQuery(params: Record<string, string | string[] | undefined>): OrderQuery {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const tab = one("tab");
  const entrega = one("entrega");
  const campana = one("campana");
  const q = one("q")?.trim().slice(0, 100);
  const query: OrderQuery = { tab: tab && (ORDER_TABS as readonly string[]).includes(tab) ? (tab as OrderTab) : "to_prepare", page: Math.max(1, Math.floor(Number(one("pagina"))) || 1) };
  if (q) query.q = q;
  if (entrega === "shipping" || entrega === "pickup") query.deliveryMethod = entrega;
  if (campana && UUID.test(campana)) query.campaignId = campana;
  return query;
}

export async function searchOrders(db: Database, query: OrderQuery): Promise<OrderList> {
  const [campaigns, result] = await Promise.all([
    listCampaigns(db),
    searchAllReservations(db, {
      query: query.q,
      tab: query.tab,
      deliveryMethod: query.deliveryMethod,
      campaignId: query.campaignId,
      limit: ORDERS_PAGE_SIZE,
      offset: (query.page - 1) * ORDERS_PAGE_SIZE,
    }),
  ]);
  const names = new Map(campaigns.map((c) => [c.id, c.productName]));
  return {
    rows: result.rows.map((r) => toOrderSummary(r, names)),
    total: result.total,
    counts: result.counts,
    page: query.page,
    pages: Math.max(1, Math.ceil(result.total / ORDERS_PAGE_SIZE)),
    campaigns: campaigns.map((c) => ({ id: c.id, slug: c.slug, productName: c.productName })),
  };
}

function answerText(value: unknown, options?: readonly { value: string; label: string }[]): string {
  const label = (v: string) => options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") return label(value);
  return "—";
}

function stripePaymentUrl(paymentIntentId: string): string {
  // Claves live: sk_live_… (estándar) o rk_live_… (restringida).
  const test = !/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  return `https://dashboard.stripe.com/${test ? "test/" : ""}payments/${paymentIntentId}`;
}

function addressLines(r: PresaleReservation): string[] | null {
  const a = r.deliveryAddress;
  if (a) return [a.name, `${a.street}, ${a.neighborhood}`, ...(a.reference ? [`Referencias: ${a.reference}`] : []), `${a.postalCode} ${a.city}, ${a.state}`, `Tel. ${a.phone}`];
  const s = r.shippingAddress;
  if (s) return [s.name, s.line1, s.line2, [s.postalCode, s.city].filter(Boolean).join(" ") + (s.state ? `, ${s.state}` : "")].filter((line): line is string => !!line);
  return null;
}

export async function getOrderDetail(db: Database, id: string, now: Date = new Date()): Promise<OrderDetail | null> {
  if (!UUID.test(id)) return null;
  const r = await findReservationById(db, id);
  if (!r) return null;
  const [campaign, terms, events, postPurchase, notes] = await Promise.all([
    getCampaignById(db, r.campaignId),
    getTermsById(db, r.termsId),
    listReservationEvents(db, r.id),
    getPostPurchaseAnswers(db, r.id),
    listOrderNotes(db, r.id),
  ]);
  const point = campaign?.pickupPoints.find((p) => p.id === r.pickupPointId) ?? null;
  const selection = r.shippingSelection;
  const answered = postPurchase && (postPurchase.submittedAt || Object.keys(postPurchase.answers).length > 0);
  const postPurchaseRows: AnswerRow[] | null = answered
    ? postPurchaseCopy.questions.map((q) => ({ label: q.label, value: answerText(postPurchase.answers[q.id], "options" in q ? q.options : undefined) }))
    : null;

  return {
    id: r.id,
    code: r.code,
    campaign: campaign ? { slug: campaign.slug, productName: campaign.productName } : null,
    customer: { fullName: r.fullName, email: r.email, phone: r.phone, marketingConsent: r.marketingConsent },
    payment: {
      status: r.status,
      quantity: r.quantity,
      unitAmount: r.unitAmount,
      shippingAmount: r.shippingAmount,
      totalAmount: r.totalAmount,
      amountRefunded: r.amountRefunded,
      currency: r.currency,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      termsVersion: terms?.version ?? null,
      stripeUrl: r.stripePaymentIntentId ? stripePaymentUrl(r.stripePaymentIntentId) : null,
    },
    delivery: {
      method: r.deliveryMethod,
      status: r.fulfillmentStatus,
      pickupPoint: point ? { name: point.name, schedule: point.schedule } : null,
      address: addressLines(r),
      selection: selection ? `${selection.carrier} ${selection.service}${selection.days ? ` · ${selection.days} ${selection.days === 1 ? "día" : "días"}` : ""}` : null,
      carrier: r.carrier,
      trackingNumber: r.trackingNumber,
      trackingUrl: r.trackingUrl,
      labelUrl: r.labelUrl,
      fulfilledAt: r.fulfilledAt,
      deliveredAt: r.deliveredAt,
    },
    bonus: { configured: !!campaign?.bonus, sentAt: r.bonusSentAt },
    nextStep: nextStepFor(r),
    incidents: incidentsFor(r, events, now),
    answers: (campaign?.questions ?? []).map((q) => ({ label: q.label, value: answerText(r.answers[q.id], q.options) })),
    postPurchase: postPurchaseRows,
    notes: notes.map((n) => ({ id: n.id, body: n.body, authorEmail: n.authorEmail, createdAt: n.createdAt })),
    timeline: events.map((e) => ({ id: e.id, at: e.createdAt, type: e.type, failed: e.type.endsWith("_FAILED") })),
  };
}
```

- [ ] **Step 4: Implementar `inbox.ts`**

```ts
import "server-only";
import { listActionableReservations, listCampaigns, listEventsForReservations, type Database } from "@inttimo/database";
import type { Inbox } from "./contract.ts";
import { INCIDENT_EVENT_TYPES, incidentsFor } from "./incidents.ts";
import { nextStepFor } from "./next-step.ts";
import { toOrderSummary } from "./orders.ts";

const DAY_MS = 86_400_000;

/** Bandeja "Por hacer": lo que requiere acción en todas las preventas, del más antiguo al más nuevo. */
export async function getInbox(db: Database, now: Date = new Date()): Promise<Inbox> {
  const [reservations, campaigns] = await Promise.all([listActionableReservations(db), listCampaigns(db)]);
  const names = new Map(campaigns.map((c) => [c.id, c.productName]));
  const events = await listEventsForReservations(
    db,
    reservations.map((r) => r.id),
    INCIDENT_EVENT_TYPES,
  );
  const eventsById = new Map<string, typeof events>();
  for (const event of events) eventsById.set(event.reservationId, [...(eventsById.get(event.reservationId) ?? []), event]);

  const inbox: Inbox = { toLabel: [], toHandOver: [], toNotify: [], awaitingPickup: [], incidents: [] };
  const byPaid = [...reservations].sort((a, b) => (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime());
  for (const r of byPaid) {
    const summary = toOrderSummary(r, names);
    for (const incident of incidentsFor(r, eventsById.get(r.id) ?? [], now)) inbox.incidents.push({ ...summary, incident });
    const step = nextStepFor(r);
    if (step.type === "generate_label") inbox.toLabel.push(summary);
    else if (step.type === "hand_to_carrier") inbox.toHandOver.push(summary);
    else if (step.type === "notify_ready") inbox.toNotify.push(summary);
    else if (step.type === "mark_picked_up") {
      const since = r.fulfilledAt ?? r.paidAt ?? r.createdAt;
      inbox.awaitingPickup.push({ ...summary, waitingDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)) });
    }
  }
  return inbox;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter inttimo test -- admin`
Expected: PASS (`admin-rules` y `admin-orders`).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: sin errores. Si `postPurchaseCopy.questions` no es un arreglo con `id`/`label`, revisar su forma en `src/content/presale.ts` (línea ~144) y ajustar el `map`.

- [ ] **Step 7: Commit**

```bash
git add apps/inttimo/src/server/admin apps/inttimo/tests/admin-orders.test.ts
git commit -m "feat(inttimo): admin queries for the inbox, order list and order detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Detalle del pedido en `/panel/pedidos/[id]`

**Files:**
- Move: `apps/inttimo/src/app/panel/(app)/reservas/[id]/actions.ts` → `apps/inttimo/src/app/panel/(app)/pedidos/[id]/actions.ts`
- Move: `apps/inttimo/src/app/panel/(app)/reservas/[id]/DeliveryForms.tsx` → `apps/inttimo/src/app/panel/(app)/pedidos/[id]/DeliveryForms.tsx`
- Create: `apps/inttimo/src/app/panel/(app)/pedidos/[id]/page.tsx`
- Replace: `apps/inttimo/src/app/panel/(app)/reservas/[id]/page.tsx` (redirección)
- Modify: `apps/inttimo/src/app/panel/ui.tsx` (`ACTION_LABELS`)

**Interfaces:**
- Consumes: `getOrderDetail` (Task 5), `handToCarrier`, `resendFulfillmentEmail` (Tasks 2–3), `resendConfirmation` (Task 3), `addOrderNote` (Task 1), contrato (Task 4).
- Produces: acciones de servidor `createLabel`, `handToCarrierAction`, `updateDelivery`, `retryBonus`, `addNote`, `resendEmail`; formularios `HandToCarrierForm`, `NoteForm`, `ResendEmailForm`.

- [ ] **Step 1: Mover archivos**

```bash
mkdir -p "apps/inttimo/src/app/panel/(app)/pedidos/[id]"
git mv "apps/inttimo/src/app/panel/(app)/reservas/[id]/actions.ts" "apps/inttimo/src/app/panel/(app)/pedidos/[id]/actions.ts"
git mv "apps/inttimo/src/app/panel/(app)/reservas/[id]/DeliveryForms.tsx" "apps/inttimo/src/app/panel/(app)/pedidos/[id]/DeliveryForms.tsx"
git mv "apps/inttimo/src/app/panel/(app)/reservas/[id]/page.tsx" "apps/inttimo/src/app/panel/(app)/pedidos/[id]/page.tsx"
```

- [ ] **Step 2: Acciones nuevas**

En `pedidos/[id]/actions.ts`:

1. Imports:

```ts
import { addOrderNote } from "@inttimo/database";
import { fulfillReservation, handToCarrier, resendFulfillmentEmail, sendBonusIfEligible, type BonusOutcome, type FulfillmentAction, type Outcome } from "@/server/presale/fulfillment";
import { resendConfirmation } from "@/server/presale/notifications";
import { getDb, getFulfillmentDeps, getShippingDeps } from "@/server/presale/runtime";
```

2. Añadir un helper y reemplazar cada `revalidatePath(\`/panel/reservas/${reservationId}\`)` por `refresh(reservationId)`:

```ts
function refresh(reservationId: string) {
  revalidatePath(`/panel/pedidos/${reservationId}`);
  revalidatePath("/panel");
}
```

3. Añadir al final:

```ts
/** El paquete ya se entregó a la paquetería: marca ENVIADO, avisa con la guía y libera el bonus. */
export async function handToCarrierAction(reservationId: string): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const result = await handToCarrier(getFulfillmentDeps(), reservationId, state.admin.email);
  if (!result.ok) return { error: result.error };
  await audit(state.admin, { action: "reservation.hand_to_carrier", targetType: "reservation", targetId: reservationId });
  refresh(reservationId);
  const messages = ["Pedido marcado como ENVIADO.", EMAIL[result.email], BONUS[result.bonus]].filter(Boolean);
  return result.email === "failed" || result.bonus === "failed" ? { error: messages.join(" ") } : { ok: messages.join(" ") };
}

const noteSchema = z.string().trim().min(1, "Escribe la nota.").max(2000, "La nota es demasiado larga (máximo 2000 caracteres).");

export async function addNote(reservationId: string, _state: DeliveryState, form: FormData): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const parsed = noteSchema.safeParse(form.get("body"));
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };
  await addOrderNote(getDb(), { reservationId, body: parsed.data, authorEmail: state.admin.email });
  await audit(state.admin, { action: "reservation.note", targetType: "reservation", targetId: reservationId });
  refresh(reservationId);
  return { ok: "Nota guardada." };
}

export async function resendEmail(reservationId: string, kind: "confirmation" | "fulfillment"): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  if (kind !== "confirmation" && kind !== "fulfillment") return { error: "Correo no válido." };
  const deps = getFulfillmentDeps();
  const outcome = kind === "confirmation" ? await resendConfirmation(getDb(), reservationId, { send: deps.send }) : await resendFulfillmentEmail(deps, reservationId);
  await audit(state.admin, { action: "reservation.resend_email", targetType: "reservation", targetId: reservationId, metadata: { kind, outcome } });
  refresh(reservationId);
  if (outcome === "sent") return { ok: "Correo reenviado." };
  if (outcome === "failed") return { error: "No se pudo enviar el correo (quedó en el historial). Inténtalo más tarde." };
  return { error: "Este correo no aplica para el estado actual del pedido." };
}
```

- [ ] **Step 3: Formularios nuevos**

En `pedidos/[id]/DeliveryForms.tsx`:

1. Cambiar el texto de `LabelForm`:

```tsx
      <p className="text-xs text-muted">Se compra con la paquetería que pagó el cliente (se descuenta del saldo de SkyDropX). El cliente aún no recibe nada: se le avisa cuando entregues el paquete.</p>
```

2. Añadir al final:

```tsx
export function HandToCarrierForm({ action }: { action: () => Promise<DeliveryState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Avisando al cliente…" : "Entregué el paquete a la paquetería"}
      </button>
    </form>
  );
}

export function NoteForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm font-medium">
        Nueva nota (solo la ve el equipo)
        <textarea name="body" rows={3} required maxLength={2000} className={inputClass} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Guardando…" : "Agregar nota"}
      </button>
    </form>
  );
}

export function ResendEmailForm({ action, label }: { action: () => Promise<DeliveryState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Enviando…" : label}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Página del detalle**

Reemplazar todo `pedidos/[id]/page.tsx` por:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { INCIDENT_LABELS, type OrderDetail } from "@/server/admin/contract";
import { getOrderDetail } from "@/server/admin/orders";
import { audit, requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Alert, Badge, buttonClass, Card, DELIVERY_LABELS, EmptyState, EVENT_LABELS, FULFILLMENT_LABELS, FULFILLMENT_TONES, linkClass, PageHeader, secondaryButtonClass, STATUS_LABELS, STATUS_TONES } from "../../../ui";
import { addNote, createLabel, handToCarrierAction, resendEmail, retryBonus, updateDelivery } from "./actions";
import { DeliveredForm, HandToCarrierForm, LabelForm, NoteForm, ReadyForPickupForm, ResendEmailForm, RetryBonusForm, ShippedForm } from "./DeliveryForms";

export const metadata = { title: "Pedido" };

const when = (date: Date | null) => (date ? date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }) : "—");
const pieces = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

/** Teléfono mexicano de 10 dígitos → número internacional para WhatsApp (sin inventar si no es claro). */
function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  return null;
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tracking({ delivery }: { delivery: OrderDetail["delivery"] }) {
  const text = `${delivery.carrier ? `${delivery.carrier} · ` : ""}${delivery.trackingNumber}`;
  return delivery.trackingUrl ? (
    <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className={linkClass}>
      {text}
    </a>
  ) : (
    <>{text}</>
  );
}

function NextStepCard({ order }: { order: OrderDetail }) {
  const step = order.nextStep;
  const deliver = updateDelivery.bind(null, order.id);
  const actionable = step.type !== "none" && step.type !== "not_paid";
  let body: ReactNode;
  switch (step.type) {
    case "not_paid":
      body = <p className="text-sm text-muted">Este pedido no está pagado: no se prepara ni se envía.</p>;
      break;
    case "generate_label":
      body = (
        <div className="space-y-4">
          {step.blocked ? (
            <p className="text-sm">Este pedido no tiene dirección completa. Pide la dirección al cliente, genera la guía en SkyDropX y regístrala abajo.</p>
          ) : (
            <LabelForm action={createLabel.bind(null, order.id)} pending={step.inProgress} />
          )}
          <details className="text-sm" open={!!step.blocked}>
            <summary className="cursor-pointer text-muted">¿Hiciste la guía por fuera del panel y ya entregaste el paquete? Regístrala aquí</summary>
            <div className="mt-3">
              <ShippedForm action={deliver} />
            </div>
          </details>
        </div>
      );
      break;
    case "hand_to_carrier":
      body = (
        <ol className="space-y-4 text-sm">
          <li>
            <p className="font-semibold">1. Imprime la guía y pégala en la caja</p>
            {order.delivery.labelUrl ? (
              <a href={order.delivery.labelUrl} target="_blank" rel="noreferrer" className={`${buttonClass} mt-2 inline-flex`}>
                Imprimir guía
              </a>
            ) : (
              <p className="mt-1 text-muted">Imprímela desde SkyDropX (guía {order.delivery.trackingNumber}).</p>
            )}
          </li>
          <li>
            <p className="font-semibold">2. Cuando entregues el paquete a {order.delivery.carrier ?? "la paquetería"}, avísalo aquí</p>
            <p className="mt-1 mb-2 text-muted">El cliente recibe su número de guía{order.bonus.configured ? " y el bonus" : ""} por correo.</p>
            <HandToCarrierForm action={handToCarrierAction.bind(null, order.id)} />
          </li>
        </ol>
      );
      break;
    case "mark_delivered":
      body = (
        <div className="space-y-2 text-sm">
          <p>
            Enviado con <Tracking delivery={order.delivery} />. Cuando la paquetería lo entregue:
          </p>
          <DeliveredForm action={deliver} />
        </div>
      );
      break;
    case "notify_ready":
      body = <ReadyForPickupForm action={deliver} />;
      break;
    case "mark_picked_up":
      body = (
        <div className="space-y-2">
          <p className="text-sm text-muted">El cliente ya fue avisado el {when(order.delivery.fulfilledAt)}. Cuando lo recoja:</p>
          <DeliveredForm action={deliver} />
        </div>
      );
      break;
    case "none":
      body = <p className="text-sm text-muted">Entregado el {when(order.delivery.deliveredAt)}. No hay nada pendiente.</p>;
      break;
  }
  return (
    <Card title="Siguiente paso" className={actionable ? "border-warning/40 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-warning)_10%,transparent)]" : ""}>
      {body}
    </Card>
  );
}

export default async function OrderPage({ params }: PageProps<"/panel/pedidos/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const order = await getOrderDetail(getDb(), id);
  if (!order) notFound();
  await audit(admin, { action: "reservation.view", targetType: "reservation", targetId: order.id });

  const { customer, payment, delivery } = order;
  const paid = payment.status === "paid" || payment.status === "partially_refunded";
  const shipping = delivery.method === "shipping";
  const whatsapp = whatsappNumber(customer.phone);

  const customerRows: [string, ReactNode][] = [
    ["Correo", customer.email],
    ["Teléfono", customer.phone ?? "—"],
    ["Entrega", DELIVERY_LABELS[delivery.method]],
    ...(shipping
      ? ([
          ["Dirección", delivery.address ? delivery.address.map((line) => <span key={line} className="block">{line}</span>) : "Sin dirección registrada"],
          ["Paquetería que eligió", delivery.selection ?? "—"],
        ] as [string, ReactNode][])
      : ([["Punto de recolección", delivery.pickupPoint ? `${delivery.pickupPoint.name} · ${delivery.pickupPoint.schedule}` : "Sin punto elegido: confirma con el cliente"]] as [string, ReactNode][])),
    ...(delivery.trackingNumber ? ([["Guía", <Tracking key="t" delivery={delivery} />]] as [string, ReactNode][]) : []),
    ...(delivery.fulfilledAt ? ([[shipping ? "Enviado el" : "Avisado el", when(delivery.fulfilledAt)]] as [string, ReactNode][]) : []),
    ...(delivery.deliveredAt ? ([["Entregado el", when(delivery.deliveredAt)]] as [string, ReactNode][]) : []),
    ...(order.bonus.configured ? ([["Bonus", order.bonus.sentAt ? `Enviado el ${when(order.bonus.sentAt)}` : "Aún no se envía"]] as [string, ReactNode][]) : []),
    ["Quiere recibir noticias", customer.marketingConsent ? "Sí" : "No"],
  ];

  const paymentRows: [string, ReactNode][] = [
    ["Estado", <Badge key="s" tone={STATUS_TONES[payment.status]}>{STATUS_LABELS[payment.status]}</Badge>],
    ["Producto", `${order.campaign?.productName ?? "—"} · ${pieces(payment.quantity)} × ${formatMoney(payment.unitAmount, payment.currency)}`],
    ["Envío", shipping ? (payment.shippingAmount ? formatMoney(payment.shippingAmount, payment.currency) : "No se cobró") : "Recolección (sin costo)"],
    ["Total pagado", formatMoney(payment.totalAmount, payment.currency)],
    ...(payment.amountRefunded ? ([["Reembolsado", formatMoney(payment.amountRefunded, payment.currency)]] as [string, ReactNode][]) : []),
    ["Pedido", when(payment.createdAt)],
    ["Pago", when(payment.paidAt)],
    ["Aceptó los términos", payment.termsVersion ? `Sí, versión ${payment.termsVersion}` : "—"],
    ...(payment.stripeUrl
      ? ([[
          "Stripe",
          <a key="stripe" href={payment.stripeUrl} target="_blank" rel="noreferrer" className={linkClass}>
            Ver el pago en Stripe
          </a>,
        ]] as [string, ReactNode][])
      : []),
  ];

  const canResendFulfillment = delivery.status === "shipped" || delivery.status === "ready_for_pickup";
  const canRetryBonus = paid && order.bonus.configured && !order.bonus.sentAt && delivery.status !== "pending";

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link href="/panel/pedidos" className="hover:text-fg">
            ← Pedidos
          </Link>
        }
        title={customer.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-fg">{order.code}</span>
            <Badge tone={STATUS_TONES[payment.status]}>{STATUS_LABELS[payment.status]}</Badge>
            <Badge tone="neutral">{DELIVERY_LABELS[delivery.method]}</Badge>
            {paid && <Badge tone={FULFILLMENT_TONES[delivery.status]}>{FULFILLMENT_LABELS[delivery.status]}</Badge>}
          </span>
        }
        actions={
          <>
            <a href={`mailto:${customer.email}?subject=${encodeURIComponent(`Tu pedido ${order.code}`)}`} className={secondaryButtonClass}>
              Escribir correo
            </a>
            {customer.phone && (
              <a href={`tel:${customer.phone.replace(/[^+\d]/g, "")}`} className={secondaryButtonClass}>
                Llamar
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                WhatsApp
              </a>
            )}
          </>
        }
      />

      {order.incidents.map((incident) => (
        <Alert key={incident}>{INCIDENT_LABELS[incident]}</Alert>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <NextStepCard order={order} />

          <Card title="Cliente y entrega">
            <Rows rows={customerRows} />
            {paid && (
              <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
                <ResendEmailForm action={resendEmail.bind(null, order.id, "confirmation")} label="Reenviar confirmación de pago" />
                {canResendFulfillment && (
                  <ResendEmailForm action={resendEmail.bind(null, order.id, "fulfillment")} label={shipping ? "Reenviar aviso de envío" : "Reenviar aviso de recolección"} />
                )}
                {canRetryBonus && <RetryBonusForm action={retryBonus.bind(null, order.id)} />}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pago">
            <Rows rows={paymentRows} />
          </Card>

          {(order.answers.length > 0 || order.postPurchase) && (
            <Card title="Respuestas del cliente">
              <dl className="space-y-3 text-sm">
                {[...order.answers, ...(order.postPurchase ?? [])].map((row) => (
                  <div key={row.label}>
                    <dt className="text-muted">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {!order.postPurchase && <p className="mt-3 text-xs text-muted">El cuestionario después de la compra aún no tiene respuestas (es opcional).</p>}
            </Card>
          )}

          <Card title="Notas internas" description="Solo las ve el equipo. No se pueden editar ni borrar.">
            {order.notes.length > 0 && (
              <ul className="mb-5 space-y-3 text-sm">
                {order.notes.map((note) => (
                  <li key={note.id} className="border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {note.authorEmail} · {when(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm action={addNote.bind(null, order.id)} />
          </Card>
        </div>
      </div>

      <Card title="Historial del pedido" description="Todo lo que ha pasado con este pedido, del más antiguo al más reciente.">
        {order.timeline.length === 0 && <EmptyState title="Todavía no hay movimientos en este pedido." />}
        <ol className="relative space-y-4 border-l border-border pl-5 text-sm empty:hidden">
          {order.timeline.map((event) => (
            <li key={event.id} className="relative">
              <span aria-hidden="true" className={`absolute top-1.5 -left-[1.6875rem] size-2.5 rounded-full border-2 border-[#fffdf9] ${event.failed ? "bg-danger" : "bg-fg/40"}`} />
              <p className={event.failed ? "font-medium text-danger" : "font-medium"}>{EVENT_LABELS[event.type] ?? "Actualización del pedido"}</p>
              <p className="mt-0.5 text-xs text-muted">{when(event.at)}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Redirección de la ruta vieja**

Crear `apps/inttimo/src/app/panel/(app)/reservas/[id]/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

/** Ruta anterior del detalle del pedido: se conserva para enlaces guardados. */
export default async function LegacyReservationPage({ params }: PageProps<"/panel/reservas/[id]">) {
  permanentRedirect(`/panel/pedidos/${(await params).id}`);
}
```

- [ ] **Step 6: Etiquetas de Actividad**

En `apps/inttimo/src/app/panel/ui.tsx`, dentro de `ACTION_LABELS`, después de `"reservation.bonus_retry"`:

```ts
  "reservation.hand_to_carrier": "Entregó un pedido a la paquetería",
  "reservation.note": "Agregó una nota a un pedido",
  "reservation.resend_email": "Reenvió un correo a un cliente",
```

- [ ] **Step 7: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: sin errores, todos los tests pasan.

Run: `grep -rn "panel/reservas" apps/inttimo/src --include=*.ts --include=*.tsx`
Expected: solo la redirección y los enlaces que se cambian en la Task 7 (home y lista de campaña).

- [ ] **Step 8: Commit**

```bash
git add apps/inttimo/src/app/panel
git commit -m "feat(inttimo): order detail with a single next step, notes and email resend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Menú, "Por hacer" y lista de pedidos

**Files:**
- Modify: `apps/inttimo/src/app/panel/(app)/PanelNav.tsx` (`LINKS` y `nav`)
- Replace: `apps/inttimo/src/app/panel/(app)/page.tsx`
- Create: `apps/inttimo/src/app/panel/(app)/pedidos/page.tsx`

**Interfaces:**
- Consumes: `getInbox`, `searchOrders`, `parseOrderQuery`, `INCIDENT_LABELS`, `ORDER_TABS`, `ORDER_TAB_LABELS` (Tasks 4–5).

- [ ] **Step 1: Menú**

En `PanelNav.tsx`, reemplazar `LINKS`:

```ts
const LINKS = [
  { href: "/panel", label: "Por hacer", match: (p: string) => p === "/panel" },
  { href: "/panel/pedidos", label: "Pedidos", match: (p: string) => p.startsWith("/panel/pedidos") || p.startsWith("/panel/reservas") },
  { href: "/panel/preventa", label: "Preventa", match: (p: string) => p.startsWith("/panel/preventa") || p.startsWith("/panel/campanas") },
  { href: "/panel/ajustes", label: "Ajustes", match: (p: string) => p.startsWith("/panel/ajustes") || p.startsWith("/panel/bitacora") },
];
```

y en el `<nav>` cambiar la clase a `"flex items-center gap-1 overflow-x-auto"` (cuatro enlaces en 375 px).

- [ ] **Step 2: "Por hacer"**

Reemplazar `apps/inttimo/src/app/panel/(app)/page.tsx`:

```tsx
import Link from "next/link";
import { INCIDENT_LABELS, type OrderSummary } from "@/server/admin/contract";
import { getInbox } from "@/server/admin/inbox";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Badge, Card, daysSince, EmptyState, PageHeader, Stat } from "../ui";

export const metadata = { title: "Por hacer" };

type Row = OrderSummary & { key: string; badge?: string };

export default async function InboxPage() {
  await requireAdmin();
  const now = new Date();
  const inbox = await getInbox(getDb(), now);
  const greeting = now.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" });
  const rows = (items: OrderSummary[]): Row[] => items.map((o) => ({ ...o, key: o.id }));

  return (
    <div className="space-y-10">
      <PageHeader title="Por hacer" subtitle={<span className="first-letter:uppercase">{greeting}</span>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Generar guía" value={inbox.toLabel.length} tone={inbox.toLabel.length ? "attention" : "good"} />
        <Stat label="Entregar a la paquetería" value={inbox.toHandOver.length} tone={inbox.toHandOver.length ? "attention" : "good"} />
        <Stat label="Avisar que está listo" value={inbox.toNotify.length} tone={inbox.toNotify.length ? "attention" : "good"} />
        <Stat label="Incidencias" value={inbox.incidents.length} tone={inbox.incidents.length ? "attention" : "good"} />
      </div>

      {inbox.incidents.length > 0 && (
        <Card title={`Incidencias · ${inbox.incidents.length}`} description="Algo falló o lleva demasiado tiempo. Abre el pedido para resolverlo.">
          <InboxList rows={inbox.incidents.map((o) => ({ ...o, key: `${o.id}-${o.incident}`, badge: INCIDENT_LABELS[o.incident] }))} action="Revisar" empty="" now={now} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Generar guía · ${inbox.toLabel.length}`} description="Pedidos con envío ya pagados. Genera la guía; al cliente todavía no le llega nada.">
          <InboxList rows={rows(inbox.toLabel)} action="Generar guía" empty="No hay guías por generar." now={now} />
        </Card>
        <Card title={`Entregar a la paquetería · ${inbox.toHandOver.length}`} description="La guía ya está lista. Imprímela y, al entregar el paquete, márcalo: ahí se avisa al cliente.">
          <InboxList rows={rows(inbox.toHandOver)} action="Imprimir o marcar" empty="No hay paquetes por entregar." now={now} />
        </Card>
        <Card title={`Avisar que está listo · ${inbox.toNotify.length}`} description="Pedidos para recoger. Cuando estén listos, avisa al cliente.">
          <InboxList rows={rows(inbox.toNotify)} action="Avisar" empty="No hay pedidos por preparar para recolección." now={now} />
        </Card>
        <Card title={`Esperando que lo recojan · ${inbox.awaitingPickup.length}`} description="El cliente ya fue avisado. Marca cuando lo recoja.">
          <InboxList
            rows={inbox.awaitingPickup.map((o) => ({ ...o, key: o.id, badge: o.waitingDays >= 3 ? `${o.waitingDays} días desde el aviso` : undefined }))}
            action="Marcar recogido"
            empty="Nadie tiene pedidos pendientes de recoger."
            now={now}
          />
        </Card>
      </div>
    </div>
  );
}

function InboxList({ rows, action, empty, now }: { rows: Row[]; action: string; empty: string; now: Date }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <ul className="-my-2 divide-y divide-border">
      {rows.map((row) => {
        const paidAt = row.paidAt ?? row.createdAt;
        const waiting = daysSince(paidAt, now);
        return (
          <li key={row.key}>
            <Link href={`/panel/pedidos/${row.id}`} className="group -mx-2 flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm transition-colors hover:bg-surface">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {row.fullName}
                  {row.badge ? <Badge tone="attention">{row.badge}</Badge> : waiting >= 3 && <Badge tone="attention">{waiting} días esperando</Badge>}
                </p>
                <p className="mt-0.5 text-muted">
                  <span className="font-mono">{row.code}</span> · {row.quantity} {row.quantity === 1 ? "pieza" : "piezas"} · {row.campaignName} · pagado el{" "}
                  {paidAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long" })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-bronze group-hover:underline group-hover:underline-offset-4">{action} →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Lista de pedidos**

Crear `apps/inttimo/src/app/panel/(app)/pedidos/page.tsx`:

```tsx
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { ORDER_TAB_LABELS, ORDER_TABS, type OrderQuery } from "@/server/admin/contract";
import { parseOrderQuery, searchOrders } from "@/server/admin/orders";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Badge, Card, DELIVERY_LABELS, EmptyState, FULFILLMENT_LABELS, FULFILLMENT_TONES, inputClass, PageHeader, secondaryButtonClass, STATUS_LABELS, STATUS_TONES } from "../../ui";

export const metadata = { title: "Pedidos" };

function hrefFor(query: OrderQuery, overrides: Partial<OrderQuery>): string {
  const next = { ...query, page: 1, ...overrides };
  const params = new URLSearchParams({ tab: next.tab, pagina: String(next.page) });
  if (next.q) params.set("q", next.q);
  if (next.deliveryMethod) params.set("entrega", next.deliveryMethod);
  if (next.campaignId) params.set("campana", next.campaignId);
  return `/panel/pedidos?${params}`;
}

export default async function OrdersPage({ searchParams }: PageProps<"/panel/pedidos">) {
  await requireAdmin();
  const query = parseOrderQuery(await searchParams);
  const list = await searchOrders(getDb(), query);
  const campaign = list.campaigns.find((c) => c.id === query.campaignId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle={campaign ? `Solo ${campaign.productName}` : "Todas las preventas"}
        actions={
          campaign && (
            <a href={`/panel/campanas/${campaign.slug}/export`} className={secondaryButtonClass}>
              Descargar lista (Excel)
            </a>
          )
        }
      />

      <nav aria-label="Estado de los pedidos" className="flex gap-2 overflow-x-auto pb-1">
        {ORDER_TABS.map((tab) => (
          <Link
            key={tab}
            href={hrefFor(query, { tab })}
            aria-current={tab === query.tab ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 border px-3 text-sm ${tab === query.tab ? "border-fg bg-fg text-bg" : "border-border hover:border-fg/40"}`}
          >
            {ORDER_TAB_LABELS[tab]}
            <span className="tabular-nums opacity-70">{list.counts[tab]}</span>
          </Link>
        ))}
      </nav>

      <Card>
        <form action="/panel/pedidos" className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={query.tab} />
          <label className="min-w-60 flex-1 text-sm font-medium">
            Buscar
            <input name="q" defaultValue={query.q} placeholder="Nombre, correo, teléfono, folio o guía" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Entrega
            <select name="entrega" defaultValue={query.deliveryMethod ?? ""} className={inputClass}>
              <option value="">Todas</option>
              <option value="shipping">{DELIVERY_LABELS.shipping}</option>
              <option value="pickup">{DELIVERY_LABELS.pickup}</option>
            </select>
          </label>
          {list.campaigns.length > 1 && (
            <label className="text-sm font-medium">
              Preventa
              <select name="campana" defaultValue={query.campaignId ?? ""} className={inputClass}>
                <option value="">Todas</option>
                {list.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.productName} ({c.slug})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
          {(query.q || query.deliveryMethod || query.campaignId) && (
            <Link href={hrefFor(query, { q: undefined, deliveryMethod: undefined, campaignId: undefined })} className="min-h-11 py-2.5 text-sm text-muted underline underline-offset-4">
              Limpiar
            </Link>
          )}
        </form>

        {list.rows.length === 0 ? (
          <EmptyState title="No hay pedidos con estos filtros." />
        ) : (
          <ul className="-my-2 divide-y divide-border">
            {list.rows.map((row) => {
              const paid = row.status === "paid" || row.status === "partially_refunded";
              return (
                <li key={row.id}>
                  <Link href={`/panel/pedidos/${row.id}`} className="-mx-2 grid gap-2 px-2 py-3 text-sm transition-colors hover:bg-surface sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-semibold">{row.fullName}</p>
                      <p className="mt-0.5 truncate text-muted">
                        <span className="font-mono">{row.code}</span> · {row.email} · {row.quantity} {row.quantity === 1 ? "pieza" : "piezas"} · {formatMoney(row.totalAmount, row.currency)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                      <Badge tone="neutral">{DELIVERY_LABELS[row.deliveryMethod]}</Badge>
                      {paid && <Badge tone={FULFILLMENT_TONES[row.fulfillmentStatus]}>{FULFILLMENT_LABELS[row.fulfillmentStatus]}</Badge>}
                      <span className="text-xs text-muted">{row.createdAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" })}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>{list.total} pedidos</span>
          <span className="flex items-center gap-2">
            {list.page > 1 && (
              <Link href={hrefFor(query, { page: list.page - 1 })} className={secondaryButtonClass}>
                ← Anterior
              </Link>
            )}
            <span>
              Página {list.page} de {list.pages}
            </span>
            {list.page < list.pages && (
              <Link href={hrefFor(query, { page: list.page + 1 })} className={secondaryButtonClass}>
                Siguiente →
              </Link>
            )}
          </span>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores. (Si el tipado de rutas de Next rechaza `href` con plantillas, revisar cómo lo resuelve el código existente de Alan y aplicar el mismo patrón.)

- [ ] **Step 5: Commit**

```bash
git add apps/inttimo/src/app/panel
git commit -m "feat(inttimo): panel inbox and global order list with tabs and search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Preventa, Ajustes, redirecciones, documentación y verificación final

**Files:**
- Create: `apps/inttimo/src/app/panel/(app)/preventa/page.tsx`
- Create: `apps/inttimo/src/app/panel/(app)/ajustes/page.tsx`
- Replace: `apps/inttimo/src/app/panel/(app)/campanas/[slug]/page.tsx` (redirección)
- Modify: `apps/inttimo/src/app/panel/(app)/campanas/[slug]/editar/page.tsx:28` (enlace de regreso)
- Modify: `apps/inttimo/src/app/panel/(app)/bitacora/page.tsx:45` (enlace de regreso)
- Create: `docs/panel-admin/CONTRATO.md`
- Modify: `docs/frontend.md` (sección "Reglas")

- [ ] **Step 1: Página Preventa**

Crear `preventa/page.tsx`:

```tsx
import { getCampaignStats, getRemainingUnits, listCampaigns } from "@inttimo/database";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getPhase } from "@/server/presale/campaign";
import { getDb } from "@/server/presale/runtime";
import { Badge, buttonClass, Card, EmptyState, PageHeader, secondaryButtonClass } from "../../ui";

export const metadata = { title: "Preventa" };

const PHASE = { upcoming: "Por abrir", open: "Abierta", closed: "Cerrada" } as const;
const ORDER = { active: 0, draft: 1, closed: 2 } as const;

export default async function PresalePage() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const campaigns = (await listCampaigns(db)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.startsAt.getTime() - a.startsAt.getTime());
  const rows = await Promise.all(campaigns.map(async (campaign) => ({ campaign, stats: await getCampaignStats(db, campaign.id), remaining: await getRemainingUnits(db, campaign, now) })));

  return (
    <div className="space-y-6">
      <PageHeader title="Preventa" subtitle="Ventas, piezas disponibles y datos de cada preventa." />
      {rows.length === 0 && <EmptyState title="Todavía no hay preventas." />}
      {rows.map(({ campaign, stats, remaining }) => {
        const phase = campaign.status === "draft" ? null : getPhase(campaign, now);
        return (
          <Card
            key={campaign.id}
            title={campaign.productName}
            description={campaign.slug}
            actions={
              <div className="flex flex-wrap gap-2">
                <a href={`/preventa/${campaign.slug}`} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                  Ver página
                </a>
                <a href={`/panel/campanas/${campaign.slug}/export`} className={secondaryButtonClass}>
                  Descargar lista (Excel)
                </a>
                <Link href={`/panel/campanas/${campaign.slug}/editar`} className={secondaryButtonClass}>
                  Editar
                </Link>
                <Link href={`/panel/pedidos?tab=all&campana=${campaign.id}`} className={buttonClass}>
                  Ver pedidos
                </Link>
              </div>
            }
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-muted">Estado</dt>
                <dd className="mt-1">
                  <Badge tone={phase === "open" ? "good" : phase === "upcoming" ? "attention" : "neutral"}>{phase ? PHASE[phase] : "Oculta"}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Cierra</dt>
                <dd className="mt-1">{formatDate(campaign.endsAt.toISOString())}</dd>
              </div>
              <div>
                <dt className="text-muted">Pedidos pagados</dt>
                <dd className="mt-1 tabular-nums">
                  {stats.paidReservations} ({stats.paidUnits} {stats.paidUnits === 1 ? "pieza" : "piezas"})
                </dd>
              </div>
              <div>
                <dt className="text-muted">Disponibles</dt>
                <dd className="mt-1 tabular-nums">{remaining === null ? "Sin límite" : `Quedan ${remaining} de ${campaign.totalUnits}`}</dd>
              </div>
              <div>
                <dt className="text-muted">Ventas (sin reembolsos)</dt>
                <dd className="mt-1 tabular-nums">{formatMoney(stats.netRevenue, campaign.currency)}</dd>
              </div>
            </dl>
          </Card>
        );
      })}
    </div>
  );
}
```

(`getRemainingUnits(db, campaign, now)` devuelve `number | null`; `null` cuando la campaña no tiene `totalUnits`.)

- [ ] **Step 2: Página Ajustes**

Crear `ajustes/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";
import { Card, PageHeader, secondaryButtonClass } from "../../ui";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Actividad" description="Quién hizo qué en el panel. No se puede editar ni borrar.">
          <Link href="/panel/bitacora" className={secondaryButtonClass}>
            Ver actividad
          </Link>
        </Card>
        <Card title="Usuarios del panel" description="Por ahora los usuarios se crean y se dan de baja con soporte técnico.">
          <p className="text-sm text-muted">Pronto podrás invitar y quitar usuarios desde aquí.</p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Redirección de la página vieja de campaña y enlaces de regreso**

Reemplazar `campanas/[slug]/page.tsx`:

```tsx
import { getCampaignBySlug } from "@inttimo/database";
import { notFound, permanentRedirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";

/** Ruta anterior de la lista de pedidos por preventa: ahora es la lista global filtrada. */
export default async function LegacyCampaignPage({ params }: PageProps<"/panel/campanas/[slug]">) {
  await requireAdmin();
  const campaign = await getCampaignBySlug(getDb(), (await params).slug);
  if (!campaign) notFound();
  permanentRedirect(`/panel/pedidos?tab=all&campana=${campaign.id}`);
}
```

En `campanas/[slug]/editar/page.tsx`, línea 28:

```tsx
        back={<Link href="/panel/preventa" className="hover:text-fg">← Preventa</Link>}
```

En `bitacora/page.tsx`, línea 45 — añadir `import Link from "next/link";` y:

```tsx
      <PageHeader back={<Link href="/panel/ajustes" className="hover:text-fg">← Ajustes</Link>} title="Actividad" subtitle="Quién hizo qué en el panel. Este registro no se puede editar ni borrar." />
```

- [ ] **Step 4: Documento del contrato para Alan**

Crear `docs/panel-admin/CONTRATO.md`:

```markdown
# Contrato del panel — para el frontend

El backend del panel vive en `apps/inttimo/src/server/admin/`. Las pantallas en `apps/inttimo/src/app/panel/**` solo muestran lo que este contrato entrega: no consultan la base ni deciden reglas.

## Qué puedes tocar

- **Sí:** `src/app/panel/**/page.tsx`, `DeliveryForms.tsx`, `PanelNav.tsx`, `ui.tsx` y `layout.tsx` (presentación, textos, orden, estilos).
- **No, sin coordinar:** `src/server/**`, los archivos `actions.ts` y `packages/**`. Si necesitas un dato que el contrato no trae, pídelo.

## Tipos

Todos están en `src/server/admin/contract.ts` (se pueden importar desde componentes de cliente).

| Tipo | Qué es |
|---|---|
| `Inbox` | Bandeja "Por hacer": `toLabel`, `toHandOver`, `toNotify`, `awaitingPickup` (con `waitingDays`) e `incidents` (con `incident`) |
| `OrderList` | Lista de pedidos: `rows`, `total`, `counts` por pestaña, `page`, `pages`, `campaigns` |
| `OrderDetail` | Detalle de un pedido; cada dato aparece una sola vez |
| `NextStep` | El único paso que toca. La pantalla muestra el botón según `nextStep.type` |
| `IncidentType` + `INCIDENT_LABELS` | Problemas abiertos y su texto |
| `ORDER_TABS` + `ORDER_TAB_LABELS` | Pestañas de la lista |

## Consultas

| Función | Archivo | Uso |
|---|---|---|
| `getInbox(db)` | `inbox.ts` | `/panel` |
| `parseOrderQuery(searchParams)` + `searchOrders(db, query)` | `orders.ts` | `/panel/pedidos` (URL: `tab`, `q`, `entrega`, `campana`, `pagina`) |
| `getOrderDetail(db, id)` | `orders.ts` | `/panel/pedidos/[id]` |

## Siguiente paso → botón

| `nextStep.type` | Qué mostrar | Acción |
|---|---|---|
| `generate_label` | "Generar guía" (o "Revisar si la guía ya está lista" si `inProgress`); si `blocked`, pedir dirección | `createLabel` |
| `hand_to_carrier` | "Imprimir guía" (`delivery.labelUrl`) + "Entregué el paquete a la paquetería" | `handToCarrierAction` |
| `mark_delivered` | "Marcar como ENTREGADO" | `updateDelivery` con `type=delivered` |
| `notify_ready` | Formulario con nota + "Marcar LISTO PARA RECOGER y avisar" | `updateDelivery` con `type=ready_for_pickup` |
| `mark_picked_up` | "Marcar como ENTREGADO" | `updateDelivery` con `type=delivered` |
| `none` / `not_paid` | Solo texto | — |

## Acciones (en `app/panel/(app)/pedidos/[id]/actions.ts`)

Todas devuelven `{ ok?: string; error?: string }` para mostrar con `<Alert>`.

| Acción | Para qué |
|---|---|
| `createLabel(id)` | Compra la guía en SkyDropX. No avisa al cliente |
| `handToCarrierAction(id)` | Marca ENVIADO, manda guía y bonus |
| `updateDelivery(id, state, form)` | Listo para recoger, entregado o guía hecha por fuera |
| `retryBonus(id)` | Reintenta el bonus |
| `addNote(id, state, form)` | Nota interna (`body`, máximo 2000) |
| `resendEmail(id, "confirmation" \| "fulfillment")` | Reenvía la confirmación de pago o el aviso de envío/recolección (sin bonus) |
```

- [ ] **Step 5: Actualizar `docs/frontend.md`**

En la sección "## Reglas", reemplazar la línea que empieza con `- **No** tocas sin coordinar:` por:

```markdown
- **No** tocas sin coordinar: `src/server/**`, `src/app/api/**`, `src/app/panel/**/actions.ts`, `src/proxy.ts`, `packages/**`. Si necesitas un dato que la API no da, pídelo.
- Panel (`src/app/panel/**`): sí puedes rediseñar las pantallas; el contrato está en [`docs/panel-admin/CONTRATO.md`](./panel-admin/CONTRATO.md).
```

Y en "Primera vez", cambiar `El panel de administración (`/panel`) no hace falta para tu trabajo.` por `Para el panel crea un usuario local con `pnpm admin --create --email=tu@correo`.`

- [ ] **Step 6: Verificación completa**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: todo pasa.

Run: `pnpm --filter inttimo build`
Expected: build sin errores. (Usar la base local: `next build` no debe tocar producción; si `.env.production.local` existe, exportar antes `DATABASE_URL` local.)

- [ ] **Step 7: Revisión manual en local**

```bash
pnpm supabase:start
pnpm db:migrate
pnpm dev:seed
pnpm dev
```

Con un usuario local (`pnpm admin --create --email=…`) entrar a `http://localhost:3100/panel` a 390 px y 1280 px y comprobar:
- El menú muestra Por hacer · Pedidos · Preventa · Ajustes sin desbordarse.
- `/panel/pedidos`: pestañas con contadores, búsqueda y "Limpiar".
- Detalle: un solo bloque "Siguiente paso"; agregar una nota la muestra en la lista.
- `/panel/reservas/<id>` y `/panel/campanas/<slug>` redirigen.
- `/panel/preventa` muestra "Quedan X de Y".

Si no se puede ejecutar algún paso, anotarlo en el PR.

- [ ] **Step 8: Commit y PR**

```bash
git add apps/inttimo/src/app/panel docs
git commit -m "feat(inttimo): presale and settings pages, legacy redirects and panel contract doc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/panel-por-hacer
gh pr create --title "feat(inttimo): panel Por hacer, pedidos y guía ≠ enviado" --body "$(cat <<'EOF'
## Qué cambia
- **Corrección:** generar la guía ya no marca ENVIADO ni manda correo/bonus. Nuevo botón “Entregué el paquete a la paquetería”.
- Menú: Por hacer · Pedidos · Preventa · Ajustes.
- Bandeja “Por hacer” con incidencias (guía fallida, correos fallidos, bonus, pagos sin confirmar, sin dirección).
- Lista global de pedidos con pestañas, búsqueda por teléfono y guía.
- Detalle con un solo “Siguiente paso”, notas internas y reenvío de correos.
- Contrato para el frontend: `docs/panel-admin/CONTRATO.md`.
- Migración 0009: `presale_order_notes` (RLS, append-only).

## Antes de desplegar
- Revisar en producción si algún pedido recibió “ya va en camino” al generar la guía sin haberse entregado a la paquetería.

## Verificación
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `next build`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

- **Cobertura del spec:** §1 → Task 2. §2.1–2.2 → Task 4. §2.3–2.5 → Task 5. §2.6 → Tasks 2, 3, 6. §3 → Task 1. §4 → Tasks 6–8. §6 → tests en Tasks 1–5 y revisión en Task 8. §7 → Task 8.
- **Cambio frente al spec:** no hay `notes.ts`; las notas usan `addOrderNote`/`listOrderNotes` de `@inttimo/database` directamente desde la acción y `getOrderDetail`. La página de redirección de campaña importa `@inttimo/database` (solo para resolver el slug).
- **Nombres consistentes:** `saveLabel`, `searchAllReservations`, `listActionableReservations`, `listEventsForReservations`, `addOrderNote`, `listOrderNotes`, `handToCarrier`/`handToCarrierAction`, `resendConfirmation`, `resendFulfillmentEmail`, `nextStepFor`, `incidentsFor`, `INCIDENT_EVENT_TYPES`, `getInbox`, `searchOrders`, `parseOrderQuery`, `getOrderDetail`, `toOrderSummary`.
