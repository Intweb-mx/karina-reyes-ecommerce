import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns.ts";

export type QuestionType = "text" | "textarea" | "select" | "multiselect" | "boolean";

export type QuestionDefinition = {
  /** Clave estable de la respuesta (a-z, 0-9, guion bajo). No cambiarla con reservas existentes. */
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  helpText?: string;
  /** Solo select / multiselect. */
  options?: { value: string; label: string }[];
  /** Solo text / textarea. */
  maxLength?: number;
};

export type ShippingAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type AnswerValue = string | string[] | boolean;
export type Answers = Record<string, AnswerValue>;

export const presaleCampaignStatus = pgEnum("presale_campaign_status", ["draft", "active", "closed"]);

export const presaleCampaigns = pgTable(
  "presale_campaigns",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    productName: text().notNull(),
    productSku: text(),
    status: presaleCampaignStatus().notNull().default("draft"),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** Precio unitario en la unidad mínima de la moneda (centavos). Fuente única del precio cobrado. */
    unitAmount: integer().notNull(),
    /** ISO 4217 en minúsculas, como la usa Stripe. */
    currency: text().notNull().default("mxn"),
    maxQuantityPerReservation: integer().notNull().default(1),
    questions: jsonb().$type<QuestionDefinition[]>().notNull().default([]),
    /** Texto aprobado sobre la entrega (p. ej. fecha estimada). Nulo si aún no está aprobado. */
    deliveryNote: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("presale_campaigns_dates_check", sql`${table.endsAt} > ${table.startsAt}`),
    check("presale_campaigns_amount_check", sql`${table.unitAmount} > 0`),
    check("presale_campaigns_currency_check", sql`${table.currency} ~ '^[a-z]{3}$'`),
    check("presale_campaigns_max_quantity_check", sql`${table.maxQuantityPerReservation} between 1 and 20`),
  ],
);

/**
 * Términos de la preventa. Cada publicación crea una versión nueva e inmutable;
 * la vigente es la de número mayor. Cada reserva guarda la versión que aceptó.
 */
export const presaleTerms = pgTable(
  "presale_terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => presaleCampaigns.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    content: text().notNull(),
    /** Correo del administrador o "cli". */
    createdBy: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("presale_terms_campaign_version_unique").on(table.campaignId, table.version),
    check("presale_terms_version_check", sql`${table.version} >= 1`),
    check("presale_terms_content_check", sql`length(trim(${table.content})) > 0`),
  ],
);

export const presaleReservationStatus = pgEnum("presale_reservation_status", [
  /** Reserva creada, esperando que el cliente pague en Stripe Checkout. */
  "pending_payment",
  /** Checkout completado con pago asíncrono (p. ej. OXXO) aún sin confirmar. */
  "processing",
  "paid",
  "payment_failed",
  /** La sesión de Checkout expiró sin pago. */
  "expired",
  "partially_refunded",
  "refunded",
  /** No se pudo crear el pago (error técnico) o se canceló manualmente. */
  "canceled",
]);

export const presaleReservations = pgTable(
  "presale_reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Folio público no secuencial (p. ej. PV-7K2M9QX4TB). */
    code: text().notNull().unique(),
    campaignId: uuid()
      .notNull()
      .references(() => presaleCampaigns.id, { onDelete: "restrict" }),
    status: presaleReservationStatus().notNull().default("pending_payment"),
    fullName: text().notNull(),
    /** Siempre en minúsculas. */
    email: text().notNull(),
    phone: text(),
    quantity: integer().notNull(),
    /** Copia del precio al momento de reservar. */
    unitAmount: integer().notNull(),
    totalAmount: integer().notNull(),
    currency: text().notNull(),
    answers: jsonb().$type<Answers>().notNull(),
    termsAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    termsId: uuid()
      .notNull()
      .references(() => presaleTerms.id, { onDelete: "restrict" }),
    marketingConsent: boolean().notNull().default(false),
    /** Clave opcional enviada por el cliente para no duplicar reservas por doble clic. */
    idempotencyKey: text().unique(),
    stripeCheckoutSessionId: text().unique(),
    stripeCheckoutUrl: text(),
    checkoutExpiresAt: timestamp({ withTimezone: true }),
    stripePaymentIntentId: text().unique(),
    /** Capturada por Stripe Checkout al pagar. */
    shippingAddress: jsonb().$type<ShippingAddress>(),
    paidAt: timestamp({ withTimezone: true }),
    amountRefunded: integer().notNull().default(0),
    confirmationEmailSentAt: timestamp({ withTimezone: true }),
    /** Atribución (utm_*, referrer). Sin PII adicional. */
    attribution: jsonb().$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("presale_reservations_campaign_status_idx").on(table.campaignId, table.status),
    index("presale_reservations_email_idx").on(table.email),
    check("presale_reservations_quantity_check", sql`${table.quantity} >= 1`),
    check("presale_reservations_total_check", sql`${table.totalAmount} = ${table.unitAmount} * ${table.quantity}`),
    check("presale_reservations_refund_check", sql`${table.amountRefunded} between 0 and ${table.totalAmount}`),
  ],
);

export type PresaleEventType =
  | "RESERVATION_CREATED"
  | "CHECKOUT_CREATED"
  | "CHECKOUT_CREATE_FAILED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_APPROVED"
  | "PAYMENT_FAILED"
  | "CHECKOUT_EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "CONFIRMATION_EMAIL_SENT"
  | "CONFIRMATION_EMAIL_FAILED"
  | "RECONCILED";

/** Timeline append-only de cada reserva. Nunca se borra ni se edita. */
export const presaleReservationEvents = pgTable(
  "presale_reservation_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservationId: uuid()
      .notNull()
      .references(() => presaleReservations.id, { onDelete: "restrict" }),
    type: text().$type<PresaleEventType>().notNull(),
    /** api | stripe | cli */
    source: text().notNull(),
    externalRef: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("presale_reservation_events_reservation_idx").on(table.reservationId, table.createdAt)],
);

/** Eventos de Stripe ya procesados: evita aplicar dos veces el mismo webhook. */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  processedAt: createdAt(),
});

/** Bitácora append-only de acciones del panel (cambios y acceso a datos personales). */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Id del usuario en Supabase Auth, o null si fue la CLI. */
    actorId: uuid(),
    actorEmail: text().notNull(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("admin_audit_log_created_idx").on(table.createdAt)],
);

/** Rate limit de ventana fija compartido entre instancias serverless. */
export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  windowStartedAt: timestamp({ withTimezone: true }).notNull(),
});
