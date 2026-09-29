import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import {
  presaleCampaigns,
  presaleReservationEvents,
  presaleReservations,
  rateLimits,
  stripeWebhookEvents,
  type PresaleEventType,
  type ShippingAddress,
} from "./schema/presale.ts";

export type PresaleCampaign = typeof presaleCampaigns.$inferSelect;
export type NewPresaleCampaign = typeof presaleCampaigns.$inferInsert;
export type PresaleReservation = typeof presaleReservations.$inferSelect;
export type ReservationStatus = PresaleReservation["status"];
export type EventSource = "api" | "stripe" | "cli";

/** Transacción o conexión: todas las funciones funcionan con ambas. */
export type Executor = Pick<Database, "select" | "insert" | "update">;

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Folio público no secuencial ni adivinable (~50 bits). */
export function generateReservationCode(): string {
  let code = "";
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `PV-${code}`;
}

/** Rate limit de ventana fija persistido en PostgreSQL. Devuelve true si se superó el límite. */
export async function hitRateLimit(db: Executor, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStartedAt: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${rateLimits.count} + 1 end`,
        windowStartedAt: sql`case when ${rateLimits.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) then now() else ${rateLimits.windowStartedAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 0) > limit;
}

// ---------- Campañas ----------

export async function getCampaignBySlug(db: Executor, slug: string): Promise<PresaleCampaign | null> {
  const [row] = await db.select().from(presaleCampaigns).where(eq(presaleCampaigns.slug, slug)).limit(1);
  return row ?? null;
}

export async function getCampaignById(db: Executor, id: string): Promise<PresaleCampaign | null> {
  const [row] = await db.select().from(presaleCampaigns).where(eq(presaleCampaigns.id, id)).limit(1);
  return row ?? null;
}

export async function upsertCampaign(db: Executor, input: NewPresaleCampaign): Promise<PresaleCampaign> {
  const { id: _id, createdAt: _createdAt, ...values } = input;
  const [row] = await db
    .insert(presaleCampaigns)
    .values(values)
    .onConflictDoUpdate({ target: presaleCampaigns.slug, set: { ...values, updatedAt: new Date() } })
    .returning();
  return row!;
}

// ---------- Reservas ----------

export async function addReservationEvent(
  db: Executor,
  reservationId: string,
  type: PresaleEventType,
  source: EventSource,
  extra: { externalRef?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await db.insert(presaleReservationEvents).values({
    reservationId,
    type,
    source,
    externalRef: extra.externalRef ?? null,
    metadata: extra.metadata ?? {},
  });
}

export type NewReservation = {
  campaignId: string;
  fullName: string;
  email: string;
  phone: string | null;
  quantity: number;
  unitAmount: number;
  currency: string;
  answers: PresaleReservation["answers"];
  marketingConsent: boolean;
  idempotencyKey: string | null;
  attribution: Record<string, string> | null;
};

export async function createReservation(db: Database, input: NewReservation): Promise<PresaleReservation> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(presaleReservations)
      .values({
        ...input,
        email: input.email.trim().toLowerCase(),
        code: generateReservationCode(),
        totalAmount: input.unitAmount * input.quantity,
        termsAcceptedAt: new Date(),
      })
      .returning();
    await addReservationEvent(tx, row!.id, "RESERVATION_CREATED", "api", { metadata: { quantity: input.quantity, totalAmount: row!.totalAmount } });
    return row!;
  });
}

export async function findReservationByIdempotencyKey(db: Executor, key: string): Promise<PresaleReservation | null> {
  const [row] = await db.select().from(presaleReservations).where(eq(presaleReservations.idempotencyKey, key)).limit(1);
  return row ?? null;
}

export async function findReservationBySessionId(db: Executor, sessionId: string): Promise<PresaleReservation | null> {
  const [row] = await db.select().from(presaleReservations).where(eq(presaleReservations.stripeCheckoutSessionId, sessionId)).limit(1);
  return row ?? null;
}

export async function findReservationByPaymentIntent(db: Executor, paymentIntentId: string): Promise<PresaleReservation | null> {
  const [row] = await db.select().from(presaleReservations).where(eq(presaleReservations.stripePaymentIntentId, paymentIntentId)).limit(1);
  return row ?? null;
}

export async function findReservationById(db: Executor, id: string): Promise<PresaleReservation | null> {
  const [row] = await db.select().from(presaleReservations).where(eq(presaleReservations.id, id)).limit(1);
  return row ?? null;
}

export async function attachCheckoutSession(
  db: Database,
  reservationId: string,
  session: { id: string; url: string; expiresAt: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(presaleReservations)
      .set({ stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url, checkoutExpiresAt: session.expiresAt })
      .where(eq(presaleReservations.id, reservationId));
    await addReservationEvent(tx, reservationId, "CHECKOUT_CREATED", "api", { externalRef: session.id });
  });
}

export async function markCheckoutFailed(db: Database, reservationId: string, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(presaleReservations)
      .set({ status: "canceled" })
      .where(and(eq(presaleReservations.id, reservationId), eq(presaleReservations.status, "pending_payment")));
    await addReservationEvent(tx, reservationId, "CHECKOUT_CREATE_FAILED", "api", { metadata: { reason } });
  });
}

// ---------- Transiciones de pago (seguras ante eventos duplicados o fuera de orden) ----------

type TransitionContext = { source: EventSource; externalRef?: string | null };

async function transition(
  db: Executor,
  reservationId: string,
  from: ReservationStatus[],
  set: Partial<typeof presaleReservations.$inferInsert>,
  event: PresaleEventType,
  ctx: TransitionContext,
  metadata: Record<string, unknown> = {},
): Promise<PresaleReservation | null> {
  const [row] = await db
    .update(presaleReservations)
    .set(set)
    .where(and(eq(presaleReservations.id, reservationId), inArray(presaleReservations.status, from)))
    .returning();
  if (row) await addReservationEvent(db, reservationId, event, ctx.source, { externalRef: ctx.externalRef, metadata });
  return row ?? null;
}

export type PaymentDetails = { paymentIntentId?: string | null; shippingAddress?: ShippingAddress | null };

function detailsToColumns(details: PaymentDetails) {
  return {
    ...(details.paymentIntentId ? { stripePaymentIntentId: details.paymentIntentId } : {}),
    ...(details.shippingAddress ? { shippingAddress: details.shippingAddress } : {}),
  };
}

/** Checkout completado con pago asíncrono pendiente (p. ej. ficha OXXO generada). */
export function markProcessing(db: Executor, reservationId: string, details: PaymentDetails, ctx: TransitionContext) {
  return transition(db, reservationId, ["pending_payment"], { status: "processing", ...detailsToColumns(details) }, "PAYMENT_PROCESSING", ctx);
}

/**
 * El dinero recibido manda: se marca pagada desde cualquier estado previo al
 * pago, incluso si antes se registró como expirada o fallida por un evento fuera de orden.
 */
export function markPaid(db: Executor, reservationId: string, details: PaymentDetails, ctx: TransitionContext) {
  return transition(
    db,
    reservationId,
    ["pending_payment", "processing", "payment_failed", "expired", "canceled"],
    { status: "paid", paidAt: new Date(), ...detailsToColumns(details) },
    "PAYMENT_APPROVED",
    ctx,
  );
}

export function markPaymentFailed(db: Executor, reservationId: string, ctx: TransitionContext) {
  return transition(db, reservationId, ["pending_payment", "processing"], { status: "payment_failed" }, "PAYMENT_FAILED", ctx);
}

export function markExpired(db: Executor, reservationId: string, ctx: TransitionContext) {
  return transition(db, reservationId, ["pending_payment"], { status: "expired" }, "CHECKOUT_EXPIRED", ctx);
}

/** `amountRefunded` es el total reembolsado acumulado que reporta Stripe; nunca disminuye. */
export async function applyRefund(db: Executor, reservation: PresaleReservation, amountRefunded: number, ctx: TransitionContext) {
  const amount = Math.min(Math.max(amountRefunded, reservation.amountRefunded), reservation.totalAmount);
  if (amount <= reservation.amountRefunded) return null;
  const full = amount >= reservation.totalAmount;
  return transition(
    db,
    reservation.id,
    ["paid", "partially_refunded"],
    { status: full ? "refunded" : "partially_refunded", amountRefunded: amount },
    full ? "REFUNDED" : "PARTIALLY_REFUNDED",
    ctx,
    { amountRefunded: amount },
  );
}

// ---------- Webhooks ----------

/** Registra el evento; devuelve false si ya se había procesado. Llamar dentro de la misma transacción que sus efectos. */
export async function claimStripeEvent(db: Executor, id: string, type: string): Promise<boolean> {
  const rows = await db.insert(stripeWebhookEvents).values({ id, type }).onConflictDoNothing().returning({ id: stripeWebhookEvents.id });
  return rows.length > 0;
}

// ---------- Correo de confirmación (idempotente) ----------

/** Reserva el envío del correo; solo una llamada gana aunque lleguen webhooks en paralelo. */
export async function claimConfirmationEmail(db: Executor, reservationId: string): Promise<PresaleReservation | null> {
  const [row] = await db
    .update(presaleReservations)
    .set({ confirmationEmailSentAt: new Date() })
    .where(
      and(
        eq(presaleReservations.id, reservationId),
        eq(presaleReservations.status, "paid"),
        sql`${presaleReservations.confirmationEmailSentAt} is null`,
      ),
    )
    .returning();
  return row ?? null;
}

export async function releaseConfirmationEmail(db: Executor, reservationId: string): Promise<void> {
  await db.update(presaleReservations).set({ confirmationEmailSentAt: null }).where(eq(presaleReservations.id, reservationId));
}

// ---------- Operación ----------

export async function listReservations(db: Executor, campaignId: string, statuses?: ReservationStatus[]): Promise<PresaleReservation[]> {
  return db
    .select()
    .from(presaleReservations)
    .where(and(eq(presaleReservations.campaignId, campaignId), statuses?.length ? inArray(presaleReservations.status, statuses) : undefined))
    .orderBy(asc(presaleReservations.createdAt));
}

/** Reservas con Checkout abierto o pago asíncrono pendiente, creadas antes de `olderThan`. */
export async function listUnsettledReservations(db: Executor, olderThan: Date): Promise<PresaleReservation[]> {
  return db
    .select()
    .from(presaleReservations)
    .where(
      and(
        inArray(presaleReservations.status, ["pending_payment", "processing"]),
        sql`${presaleReservations.stripeCheckoutSessionId} is not null`,
        lt(presaleReservations.createdAt, olderThan),
      ),
    )
    .orderBy(asc(presaleReservations.createdAt));
}

export async function listPaidWithoutConfirmation(db: Executor): Promise<PresaleReservation[]> {
  return db
    .select()
    .from(presaleReservations)
    .where(and(eq(presaleReservations.status, "paid"), sql`${presaleReservations.confirmationEmailSentAt} is null`))
    .orderBy(asc(presaleReservations.paidAt));
}

export async function listReservationEvents(db: Executor, reservationId: string) {
  return db
    .select()
    .from(presaleReservationEvents)
    .where(eq(presaleReservationEvents.reservationId, reservationId))
    .orderBy(asc(presaleReservationEvents.createdAt));
}
