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

/** Bonus digital de la campaña. URLs de los archivos y vigencia del enlace las define el negocio (no hay valores por defecto). */
export type BonusConfig = {
  title: string;
  pdfUrl: string | null;
  videoUrl: string | null;
  /** Días que dura el enlace personal desde que se envía. */
  linkDays: number;
};

/** Punto de recolección configurado en la campaña (datos del negocio). */
export type PickupPoint = {
  /** Clave estable (a-z, 0-9, guion). No cambiarla con pedidos existentes. */
  id: string;
  name: string;
  /** Día y horario o condiciones, visible al cliente. */
  schedule: string;
};

/** Origen de los envíos y paquete por unidad, para cotizar con la paquetería. */
export type ShippingProfile = {
  origin: {
    name: string;
    company: string | null;
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    email: string;
    reference: string | null;
  };
  /** Paquete de 1 unidad. Para N unidades se suma el peso y se apila la altura. */
  parcel: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };
  /** Paqueterías permitidas (nombres de SkyDropX en minúsculas). Vacío = todas. */
  carriers: string[];
  /** Clave SAT del contenido (carta porte) y tipo de empaque que pide SkyDropX al generar la guía. */
  consignmentNote: string;
  packageType: string;
};

/** Dirección capturada en el checkout para envío a domicilio. */
export type DeliveryAddress = {
  name: string;
  phone: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string | null;
};

/** Opción de envío elegida por el cliente (copia de la cotización). */
export type ShippingSelection = {
  provider: "skydropx";
  quotationId: string;
  rateId: string;
  carrier: string;
  service: string;
  days: number | null;
  /** ISO: cuándo se cotizó (SkyDropX respeta el rate 24 h). */
  quotedAt: string;
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
    /** Unidades totales a la venta en la campaña (sin sobreventa). Nulo = sin tope. */
    totalUnits: integer(),
    /** Recolección sin costo (Chihuahua). */
    pickupEnabled: boolean().notNull().default(true),
    /** Envío a domicilio dentro de México. */
    shippingEnabled: boolean().notNull().default(true),
    /** @deprecated Ya no se usa: el envío se cotiza con SkyDropX antes del pago. Se conserva por compatibilidad. */
    shippingAmount: integer(),
    /** Puntos de recolección disponibles. */
    pickupPoints: jsonb().$type<PickupPoint[]>().notNull().default([]),
    /** Origen y paquete para cotizar envíos. Nulo = el envío a domicilio no está disponible. */
    shippingProfile: jsonb().$type<ShippingProfile>(),
    /** Bonus digital que se libera al enviar o tener listo el pedido. Nulo = la campaña no tiene bonus configurado. */
    bonus: jsonb().$type<BonusConfig>(),
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
    check("presale_campaigns_total_units_check", sql`${table.totalUnits} is null or ${table.totalUnits} > 0`),
    check("presale_campaigns_shipping_amount_check", sql`${table.shippingAmount} is null or ${table.shippingAmount} >= 0`),
    check("presale_campaigns_delivery_check", sql`${table.pickupEnabled} or ${table.shippingEnabled}`),
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

export const presaleDeliveryMethod = pgEnum("presale_delivery_method", ["shipping", "pickup"]);

export const presaleFulfillmentStatus = pgEnum("presale_fulfillment_status", [
  /** Pagado, en preparación. */
  "pending",
  /** Recolección: el cliente ya puede pasar por su pedido. */
  "ready_for_pickup",
  /** Envío: entregado a paquetería. */
  "shipped",
  "delivered",
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
    deliveryMethod: presaleDeliveryMethod().notNull().default("shipping"),
    /** Envío cobrado en el mismo pago (centavos); 0 en recolección. */
    shippingAmount: integer().notNull().default(0),
    /** Recolección: id del punto elegido (ver campaña.pickupPoints). */
    pickupPointId: text(),
    /** Envío: dirección capturada en el checkout, antes de Stripe. */
    deliveryAddress: jsonb().$type<DeliveryAddress>(),
    /** Envío: tarifa elegida. */
    shippingSelection: jsonb().$type<ShippingSelection>(),
    /** unitAmount * quantity + shippingAmount. */
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
    fulfillmentStatus: presaleFulfillmentStatus().notNull().default("pending"),
    carrier: text(),
    trackingNumber: text(),
    trackingUrl: text(),
    /** Guía generada en SkyDropX. */
    shipmentId: text(),
    labelUrl: text(),
    /** Cuándo pasó a enviado o listo para recoger. */
    fulfilledAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    /** Envío del bonus reclamado (idempotente). */
    bonusSentAt: timestamp({ withTimezone: true }),
    /** Atribución (utm_*, referrer). Sin PII adicional. */
    attribution: jsonb().$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("presale_reservations_campaign_status_idx").on(table.campaignId, table.status),
    index("presale_reservations_email_idx").on(table.email),
    check("presale_reservations_quantity_check", sql`${table.quantity} >= 1`),
    check("presale_reservations_total_check", sql`${table.totalAmount} = ${table.unitAmount} * ${table.quantity} + ${table.shippingAmount}`),
    check("presale_reservations_shipping_check", sql`${table.shippingAmount} >= 0 and (${table.deliveryMethod} = 'shipping' or ${table.shippingAmount} = 0)`),
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
  | "READY_FOR_PICKUP"
  | "SHIPPED"
  | "DELIVERED"
  | "FULFILLMENT_EMAIL_SENT"
  | "FULFILLMENT_EMAIL_FAILED"
  | "LABEL_CREATED"
  | "LABEL_FAILED"
  | "BONUS_SENT"
  | "BONUS_FAILED"
  | "POST_PURCHASE_ANSWERS_SUBMITTED"
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

/**
 * Enlaces personales y temporales al bonus digital. Solo se guarda el hash del token:
 * con la base filtrada no se pueden reconstruir los enlaces.
 */
export const presaleBonusLinks = pgTable(
  "presale_bonus_links",
  {
    id: uuid().primaryKey().defaultRandom(),
    reservationId: uuid()
      .notNull()
      .references(() => presaleReservations.id, { onDelete: "restrict" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    firstOpenedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("presale_bonus_links_reservation_idx").on(table.reservationId)],
);

/**
 * Cotizaciones de envío mostradas al cliente. El precio cobrado sale de aquí, nunca del navegador.
 */
export const presaleShippingQuotes = pgTable(
  "presale_shipping_quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid()
      .notNull()
      .references(() => presaleCampaigns.id, { onDelete: "restrict" }),
    quantity: integer().notNull(),
    postalCode: text().notNull(),
    quotationId: text().notNull(),
    /** Opciones ofrecidas, con su precio en centavos. */
    options: jsonb()
      .$type<{ id: string; rateId: string; carrier: string; service: string; days: number | null; amount: number }[]>()
      .notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("presale_shipping_quotes_created_idx").on(table.createdAt)],
);

/**
 * Respuestas del cuestionario posterior a la compra (3 preguntas fijas, todas opcionales, ver
 * `postPurchaseCopy` en content/presale.ts). Se va guardando aunque el cliente no presione "enviar";
 * `submittedAt` solo se marca cuando sí lo hace. No condiciona el bonus ni ninguna decisión automática.
 */
export const presalePostPurchaseAnswers = pgTable("presale_post_purchase_answers", {
  id: uuid().primaryKey().defaultRandom(),
  reservationId: uuid()
    .notNull()
    .unique()
    .references(() => presaleReservations.id, { onDelete: "cascade" }),
  answers: jsonb().$type<Answers>().notNull().default({}),
  submittedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
