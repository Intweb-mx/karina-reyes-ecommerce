import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, sum } from "drizzle-orm";
import type { Database } from "./client.ts";
import {
  adminAuditLog,
  presaleBonusLinks,
  presaleCampaigns,
  presaleOrderNotes,
  presaleTerms,
  presalePostPurchaseAnswers,
  presaleReservationEvents,
  presaleReservations,
  presaleShippingQuotes,
  rateLimits,
  stripeWebhookEvents,
  type Answers,
  type DeliveryAddress,
  type PresaleEventType,
  type ShippingAddress,
  type ShippingSelection,
} from "./schema/presale.ts";

export type PresaleCampaign = typeof presaleCampaigns.$inferSelect;
export type NewPresaleCampaign = typeof presaleCampaigns.$inferInsert;
export type PresaleReservation = typeof presaleReservations.$inferSelect;
export type ReservationStatus = PresaleReservation["status"];
export type EventSource = "api" | "stripe" | "cli" | "panel" | "skydropx";
export type DeliveryMethod = PresaleReservation["deliveryMethod"];
export type FulfillmentStatus = PresaleReservation["fulfillmentStatus"];
export type PaymentMethod = PresaleReservation["paymentMethod"];

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

/** Campaña que se muestra en la raíz del sitio: la activa más reciente o, si no hay, la última cerrada. Nunca un borrador. */
export async function getFeaturedCampaign(db: Executor): Promise<PresaleCampaign | null> {
  const [row] = await db
    .select()
    .from(presaleCampaigns)
    .where(inArray(presaleCampaigns.status, ["active", "closed"]))
    .orderBy(sql`${presaleCampaigns.status} = 'active' desc`, desc(presaleCampaigns.startsAt))
    .limit(1);
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
  /** Por defecto "shipping" con envío 0. */
  deliveryMethod?: DeliveryMethod;
  shippingAmount?: number;
  pickupPointId?: string | null;
  deliveryAddress?: DeliveryAddress | null;
  shippingSelection?: ShippingSelection | null;
  answers: PresaleReservation["answers"];
  termsId: string;
  marketingConsent: boolean;
  idempotencyKey: string | null;
  attribution: Record<string, string> | null;
};

/** Ventana en la que una reserva sin sesión de Checkout aún cuenta como inventario apartado (mientras se crea el pago). */
const UNATTACHED_HOLD_MINUTES = 5;

/**
 * Unidades que ocupan inventario: vendidas (pagadas o con pago en proceso) y apartadas por un Checkout todavía vigente.
 * Las reservas vencidas, fallidas, canceladas o reembolsadas por completo liberan su cantidad.
 */
export async function countHeldUnits(db: Executor, campaignId: string, now: Date = new Date()): Promise<number> {
  const unattachedSince = new Date(now.getTime() - UNATTACHED_HOLD_MINUTES * 60_000);
  const [row] = await db
    .select({ units: sum(presaleReservations.quantity).mapWith(Number) })
    .from(presaleReservations)
    .where(
      and(
        eq(presaleReservations.campaignId, campaignId),
        or(
          inArray(presaleReservations.status, ["paid", "partially_refunded", "processing"]),
          and(
            eq(presaleReservations.status, "pending_payment"),
            or(
              gt(presaleReservations.checkoutExpiresAt, now),
              and(isNull(presaleReservations.checkoutExpiresAt), gt(presaleReservations.createdAt, unattachedSince)),
            ),
          ),
        ),
      ),
    );
  return row?.units ?? 0;
}

/** Unidades aún disponibles, o null si la campaña no tiene tope. */
export async function getRemainingUnits(db: Executor, campaign: Pick<PresaleCampaign, "id" | "totalUnits">, now: Date = new Date()): Promise<number | null> {
  if (campaign.totalUnits === null) return null;
  return Math.max(0, campaign.totalUnits - (await countHeldUnits(db, campaign.id, now)));
}

/** La cantidad pedida supera el inventario de la campaña. */
export class InsufficientStockError extends Error {
  readonly remaining: number;
  constructor(remaining: number) {
    super(`Solo quedan ${remaining} unidades.`);
    this.name = "InsufficientStockError";
    this.remaining = remaining;
  }
}

/**
 * Crea la reserva apartando inventario. Bloquea la fila de la campaña durante la transacción: dos compras
 * simultáneas se serializan y nunca pueden sumar más que `totalUnits` (sin sobreventa).
 */
export async function createReservation(db: Database, input: NewReservation, now: Date = new Date()): Promise<PresaleReservation> {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(presaleCampaigns).where(eq(presaleCampaigns.id, input.campaignId)).for("update");
    if (campaign?.totalUnits != null) {
      const remaining = Math.max(0, campaign.totalUnits - (await countHeldUnits(tx, campaign.id, now)));
      if (input.quantity > remaining) throw new InsufficientStockError(remaining);
    }
    const [row] = await tx
      .insert(presaleReservations)
      .values({
        ...input,
        email: input.email.trim().toLowerCase(),
        code: generateReservationCode(),
        totalAmount: input.unitAmount * input.quantity + (input.shippingAmount ?? 0),
        termsAcceptedAt: new Date(),
      })
      .returning();
    await addReservationEvent(tx, row!.id, "RESERVATION_CREATED", "api", {
      metadata: { quantity: input.quantity, deliveryMethod: row!.deliveryMethod, shippingAmount: row!.shippingAmount, totalAmount: row!.totalAmount },
    });
    return row!;
  });
}

export type NewManualSale = {
  campaignId: string;
  fullName: string;
  /** Vacío si el cliente no dio correo: entonces no se le manda ningún correo. */
  email: string;
  phone: string | null;
  quantity: number;
  /** Descuento sobre precio de campaña × cantidad (centavos). */
  discountAmount: number;
  paymentMethod: Exclude<PaymentMethod, "stripe">;
  recordedBy: string;
};

/**
 * Venta presencial registrada en el panel: queda pagada al instante, sin Stripe, con el precio de la campaña y aparta
 * inventario con el mismo candado que una compra en línea (sin sobreventa). Se entrega en persona (recolección sin punto).
 */
export async function createManualSale(db: Database, input: NewManualSale, now: Date = new Date()): Promise<PresaleReservation> {
  return db.transaction(async (tx) => {
    const [campaign] = await tx.select().from(presaleCampaigns).where(eq(presaleCampaigns.id, input.campaignId)).for("update");
    if (!campaign) throw new Error("Campaña no encontrada.");
    if (campaign.totalUnits != null) {
      const remaining = Math.max(0, campaign.totalUnits - (await countHeldUnits(tx, campaign.id, now)));
      if (input.quantity > remaining) throw new InsufficientStockError(remaining);
    }
    const subtotal = campaign.unitAmount * input.quantity;
    const [row] = await tx
      .insert(presaleReservations)
      .values({
        campaignId: campaign.id,
        code: generateReservationCode(),
        status: "paid",
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
        quantity: input.quantity,
        unitAmount: campaign.unitAmount,
        currency: campaign.currency,
        deliveryMethod: "pickup",
        discountAmount: input.discountAmount,
        totalAmount: subtotal - input.discountAmount,
        paymentMethod: input.paymentMethod,
        recordedBy: input.recordedBy,
        answers: {},
        marketingConsent: false,
        paidAt: now,
      })
      .returning();
    const meta = { quantity: input.quantity, totalAmount: row!.totalAmount, discountAmount: input.discountAmount, paymentMethod: input.paymentMethod };
    await addReservationEvent(tx, row!.id, "RESERVATION_CREATED", "panel", { metadata: { ...meta, manual: true } });
    await addReservationEvent(tx, row!.id, "MANUAL_SALE_RECORDED", "panel", { metadata: { ...meta, recordedBy: input.recordedBy } });
    await addReservationEvent(tx, row!.id, "PAYMENT_APPROVED", "panel", { metadata: { paymentMethod: input.paymentMethod } });
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

/** Pedido de envío por el id de envío de SkyDropX o por su número de guía (avisos de rastreo). */
export async function findReservationByShipment(db: Executor, ref: { shipmentId?: string | null; trackingNumber?: string | null }): Promise<PresaleReservation | null> {
  const conditions = [
    ref.shipmentId ? eq(presaleReservations.shipmentId, ref.shipmentId) : undefined,
    ref.trackingNumber ? eq(presaleReservations.trackingNumber, ref.trackingNumber) : undefined,
  ].filter((c) => c !== undefined);
  if (conditions.length === 0) return null;
  const [row] = await db.select().from(presaleReservations).where(or(...conditions)).limit(1);
  return row ?? null;
}

/** Guarda el enlace de rastreo de la paquetería solo si el pedido aún no tiene uno. */
export async function saveTrackingUrlIfMissing(db: Executor, reservationId: string, trackingUrl: string): Promise<void> {
  await db
    .update(presaleReservations)
    .set({ trackingUrl })
    .where(and(eq(presaleReservations.id, reservationId), isNull(presaleReservations.trackingUrl)));
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

// ---------- Cumplimiento (entrega) ----------

/** Solo pedidos pagados (o con reembolso parcial) se preparan y entregan. */
const FULFILLABLE: ReservationStatus[] = ["paid", "partially_refunded"];

type FulfillmentContext = { source: EventSource; actor?: string | null };

async function fulfillmentTransition(
  db: Executor,
  reservationId: string,
  where: { method?: DeliveryMethod; from: FulfillmentStatus[] },
  set: Partial<typeof presaleReservations.$inferInsert>,
  event: PresaleEventType,
  ctx: FulfillmentContext,
  metadata: Record<string, unknown> = {},
): Promise<PresaleReservation | null> {
  const [row] = await db
    .update(presaleReservations)
    .set(set)
    .where(
      and(
        eq(presaleReservations.id, reservationId),
        inArray(presaleReservations.status, FULFILLABLE),
        inArray(presaleReservations.fulfillmentStatus, where.from),
        where.method ? eq(presaleReservations.deliveryMethod, where.method) : undefined,
      ),
    )
    .returning();
  if (row) await addReservationEvent(db, reservationId, event, ctx.source, { metadata: { ...metadata, ...(ctx.actor ? { actor: ctx.actor } : {}) } });
  return row ?? null;
}

/** Recolección: el pedido ya se puede recoger. Devuelve null si no aplica (no pagado, no es recolección o ya avanzó). */
export function markReadyForPickup(db: Executor, reservationId: string, ctx: FulfillmentContext) {
  return fulfillmentTransition(db, reservationId, { method: "pickup", from: ["pending"] }, { fulfillmentStatus: "ready_for_pickup", fulfilledAt: new Date() }, "READY_FOR_PICKUP", ctx);
}

export type ShipmentDetails = { carrier: string; trackingNumber: string; trackingUrl: string | null; shipmentId?: string | null; labelUrl?: string | null };

/** Envío: entregado a paquetería con su guía. */
export function markShipped(db: Executor, reservationId: string, shipment: ShipmentDetails, ctx: FulfillmentContext) {
  return fulfillmentTransition(
    db,
    reservationId,
    { method: "shipping", from: ["pending"] },
    { fulfillmentStatus: "shipped", fulfilledAt: new Date(), ...shipment },
    "SHIPPED",
    ctx,
    { ...shipment },
  );
}

/** Entregado: desde enviado o listo para recoger; en recolección también directo desde pendiente (entrega en persona). */
export async function markDelivered(db: Executor, reservationId: string, ctx: FulfillmentContext) {
  const set = { fulfillmentStatus: "delivered" as const, deliveredAt: new Date() };
  return (
    (await fulfillmentTransition(db, reservationId, { from: ["ready_for_pickup", "shipped"] }, set, "DELIVERED", ctx)) ??
    (await fulfillmentTransition(db, reservationId, { method: "pickup", from: ["pending"] }, set, "DELIVERED", ctx))
  );
}

// ---------- Cotizaciones de envío ----------

export type ShippingQuote = typeof presaleShippingQuotes.$inferSelect;

export async function saveShippingQuote(db: Executor, input: typeof presaleShippingQuotes.$inferInsert): Promise<ShippingQuote> {
  const [row] = await db.insert(presaleShippingQuotes).values(input).returning();
  return row!;
}

export async function getShippingQuote(db: Executor, id: string): Promise<ShippingQuote | null> {
  const [row] = await db.select().from(presaleShippingQuotes).where(eq(presaleShippingQuotes.id, id)).limit(1);
  return row ?? null;
}

/** Guía comprada en SkyDropX. Con número de guía queda lista para imprimir; el pedido NO pasa a enviado aquí. */
export async function saveLabel(
  db: Executor,
  reservationId: string,
  label: { shipmentId: string; labelUrl: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null },
): Promise<void> {
  await db.update(presaleReservations).set(label).where(eq(presaleReservations.id, reservationId));
}

// ---------- Bonus ----------

/** Reserva el envío del bonus; solo una llamada gana. Exige pedido pagado y ya enviado / listo / entregado. */
export async function claimBonusSend(db: Executor, reservationId: string): Promise<PresaleReservation | null> {
  const [row] = await db
    .update(presaleReservations)
    .set({ bonusSentAt: new Date() })
    .where(
      and(
        eq(presaleReservations.id, reservationId),
        inArray(presaleReservations.status, FULFILLABLE),
        inArray(presaleReservations.fulfillmentStatus, ["ready_for_pickup", "shipped", "delivered"]),
        isNull(presaleReservations.bonusSentAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function releaseBonusSend(db: Executor, reservationId: string): Promise<void> {
  await db.update(presaleReservations).set({ bonusSentAt: null }).where(eq(presaleReservations.id, reservationId));
}

export async function createBonusLink(db: Executor, input: { reservationId: string; tokenHash: string; expiresAt: Date }) {
  const [row] = await db.insert(presaleBonusLinks).values(input).returning();
  return row!;
}

export type BonusLink = typeof presaleBonusLinks.$inferSelect;

/** Enlace por hash del token con su reserva. Registra la primera apertura. */
export async function openBonusLink(db: Executor, tokenHash: string): Promise<{ link: BonusLink; reservation: PresaleReservation } | null> {
  const [row] = await db
    .select({ link: presaleBonusLinks, reservation: presaleReservations })
    .from(presaleBonusLinks)
    .innerJoin(presaleReservations, eq(presaleReservations.id, presaleBonusLinks.reservationId))
    .where(eq(presaleBonusLinks.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  if (!row.link.firstOpenedAt) {
    await db.update(presaleBonusLinks).set({ firstOpenedAt: new Date() }).where(and(eq(presaleBonusLinks.id, row.link.id), isNull(presaleBonusLinks.firstOpenedAt)));
  }
  return row;
}

// ---------- Cuestionario posterior a la compra ----------

export type PostPurchaseAnswers = typeof presalePostPurchaseAnswers.$inferSelect;

/** Upsert idempotente: se puede llamar en cada cambio sin enviar ("autoguardado") y una vez más al enviar. */
export async function savePostPurchaseAnswers(db: Executor, reservationId: string, answers: Answers, submit: boolean): Promise<PostPurchaseAnswers> {
  const [row] = await db
    .insert(presalePostPurchaseAnswers)
    .values({ reservationId, answers, submittedAt: submit ? new Date() : null })
    .onConflictDoUpdate({
      target: presalePostPurchaseAnswers.reservationId,
      set: { answers, updatedAt: new Date(), ...(submit ? { submittedAt: new Date() } : {}) },
    })
    .returning();
  return row!;
}

export async function getPostPurchaseAnswers(db: Executor, reservationId: string): Promise<PostPurchaseAnswers | null> {
  const [row] = await db.select().from(presalePostPurchaseAnswers).where(eq(presalePostPurchaseAnswers.reservationId, reservationId)).limit(1);
  return row ?? null;
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
        sql`${presaleReservations.email} <> ''`,
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
    .where(and(eq(presaleReservations.status, "paid"), sql`${presaleReservations.confirmationEmailSentAt} is null`, sql`${presaleReservations.email} <> ''`))
    .orderBy(asc(presaleReservations.paidAt));
}

export async function listReservationEvents(db: Executor, reservationId: string) {
  return db
    .select()
    .from(presaleReservationEvents)
    .where(eq(presaleReservationEvents.reservationId, reservationId))
    .orderBy(asc(presaleReservationEvents.createdAt));
}

// ---------- Términos versionados ----------

export type PresaleTerms = typeof presaleTerms.$inferSelect;

export async function getCurrentTerms(db: Executor, campaignId: string): Promise<PresaleTerms | null> {
  const [row] = await db
    .select()
    .from(presaleTerms)
    .where(eq(presaleTerms.campaignId, campaignId))
    .orderBy(desc(presaleTerms.version))
    .limit(1);
  return row ?? null;
}

export async function getTermsById(db: Executor, id: string): Promise<PresaleTerms | null> {
  const [row] = await db.select().from(presaleTerms).where(eq(presaleTerms.id, id)).limit(1);
  return row ?? null;
}

export async function listTermsVersions(db: Executor, campaignId: string) {
  return db
    .select({ id: presaleTerms.id, version: presaleTerms.version, createdBy: presaleTerms.createdBy, createdAt: presaleTerms.createdAt })
    .from(presaleTerms)
    .where(eq(presaleTerms.campaignId, campaignId))
    .orderBy(desc(presaleTerms.version));
}

/** Publica una versión nueva (siguiente número). Si dos publicaciones chocan, la segunda reintenta con el número siguiente. */
export async function publishTerms(db: Database, campaignId: string, content: string, createdBy: string): Promise<PresaleTerms> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await db
        .insert(presaleTerms)
        .values({
          campaignId,
          content: content.trim(),
          createdBy,
          version: sql`coalesce((select max(${presaleTerms.version}) from ${presaleTerms} where ${presaleTerms.campaignId} = ${campaignId}), 0) + 1`,
        })
        .returning();
      return row!;
    } catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
      if (code !== "23505" || attempt >= 2) throw error;
    }
  }
}

// ---------- Bitácora del panel ----------

export type AuditEntry = {
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAdminAction(db: Executor, entry: AuditEntry): Promise<void> {
  await db.insert(adminAuditLog).values({ ...entry, targetId: entry.targetId ?? null, metadata: entry.metadata ?? {} });
}

export async function listAdminActions(db: Executor, limit = 50) {
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
}

// ---------- Panel ----------

export async function listCampaigns(db: Executor): Promise<PresaleCampaign[]> {
  return db.select().from(presaleCampaigns).orderBy(desc(presaleCampaigns.startsAt));
}

export async function updateCampaign(
  db: Executor,
  id: string,
  patch: Partial<Omit<NewPresaleCampaign, "id" | "slug" | "createdAt" | "updatedAt">>,
): Promise<PresaleCampaign | null> {
  const [row] = await db.update(presaleCampaigns).set(patch).where(eq(presaleCampaigns.id, id)).returning();
  return row ?? null;
}

export type CampaignStats = {
  byStatus: Partial<Record<ReservationStatus, number>>;
  /** Reservas pagadas (incluye parcialmente reembolsadas). */
  paidReservations: number;
  paidUnits: number;
  /** Cobrado menos reembolsado, en centavos. */
  netRevenue: number;
  refunded: number;
  /** netRevenue separado por forma de pago. */
  revenueByMethod: Record<PaymentMethod, number>;
};

export async function getCampaignStats(db: Executor, campaignId: string): Promise<CampaignStats> {
  const rows = await db
    .select({
      status: presaleReservations.status,
      reservations: count(),
      units: sum(presaleReservations.quantity).mapWith(Number),
      amount: sum(presaleReservations.totalAmount).mapWith(Number),
      refunded: sum(presaleReservations.amountRefunded).mapWith(Number),
      paymentMethod: presaleReservations.paymentMethod,
    })
    .from(presaleReservations)
    .where(eq(presaleReservations.campaignId, campaignId))
    .groupBy(presaleReservations.status, presaleReservations.paymentMethod);

  const stats: CampaignStats = { byStatus: {}, paidReservations: 0, paidUnits: 0, netRevenue: 0, refunded: 0, revenueByMethod: { stripe: 0, cash: 0, transfer: 0 } };
  for (const row of rows) {
    stats.byStatus[row.status] = (stats.byStatus[row.status] ?? 0) + row.reservations;
    if (row.status === "paid" || row.status === "partially_refunded" || row.status === "refunded") {
      const net = (row.amount ?? 0) - (row.refunded ?? 0);
      stats.netRevenue += net;
      stats.revenueByMethod[row.paymentMethod] += net;
      stats.refunded += row.refunded ?? 0;
    }
    if (row.status === "paid" || row.status === "partially_refunded") {
      stats.paidReservations += row.reservations;
      stats.paidUnits += row.units ?? 0;
    }
  }
  return stats;
}

export type ReservationSearch = { query?: string; statuses?: ReservationStatus[]; limit: number; offset: number };

/** Búsqueda paginada por folio, correo o nombre. */
export async function searchReservations(db: Executor, campaignId: string, search: ReservationSearch) {
  const term = search.query?.trim();
  const escaped = term?.replace(/[\\%_]/g, (c) => `\\${c}`);
  const where = and(
    eq(presaleReservations.campaignId, campaignId),
    search.statuses?.length ? inArray(presaleReservations.status, search.statuses) : undefined,
    escaped
      ? or(
          ilike(presaleReservations.code, `%${escaped}%`),
          ilike(presaleReservations.email, `%${escaped}%`),
          ilike(presaleReservations.fullName, `%${escaped}%`),
        )
      : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db.select().from(presaleReservations).where(where).orderBy(desc(presaleReservations.createdAt)).limit(search.limit).offset(search.offset),
    db.select({ value: count() }).from(presaleReservations).where(where),
  ]);
  return { rows, total: total?.value ?? 0 };
}

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
