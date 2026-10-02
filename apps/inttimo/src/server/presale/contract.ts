/*
 * Contrato público de la API de preventa. El frontend puede importar estos
 * tipos directamente. Montos siempre en la unidad mínima de la moneda (centavos).
 */
import type { AnswerValue, QuestionDefinition } from "@inttimo/database";

export type PresalePhase = "upcoming" | "open" | "closed";

export type DeliveryMethod = "shipping" | "pickup";

export type PickupPointInfo = { id: string; name: string; schedule: string };

/** Dirección de envío capturada en el checkout (nombre y teléfono salen de los datos del cliente). */
export type DeliveryAddressInput = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  /** 5 dígitos; debe coincidir con el de la cotización. */
  postalCode: string;
  reference?: string;
};

/** POST /api/preventa/[slug]/envio */
export type ShippingQuoteRequest = Omit<DeliveryAddressInput, "street" | "reference"> & { quantity: number };

/** Opciones de envío. Montos en centavos. La cotización vence en `expiresAt`; después hay que pedir otra. */
export type ShippingQuoteResponse = {
  quoteId: string;
  expiresAt: string;
  currency: string;
  /** "economico" siempre; "express" solo si hay una opción más rápida. */
  options: { id: "economico" | "express"; carrier: string; service: string; days: number | null; amount: number }[];
};

export type FulfillmentStatus = "pending" | "ready_for_pickup" | "shipped" | "delivered";

/** GET /api/preventa/[slug] */
export type PublicCampaign = {
  slug: string;
  productName: string;
  unitAmount: number;
  currency: string;
  maxQuantityPerReservation: number;
  /** ISO 8601. El contador corre hasta `endsAt`; usar `serverTime` para corregir el reloj del cliente. */
  startsAt: string;
  endsAt: string;
  serverTime: string;
  phase: PresalePhase;
  /** Unidades totales de la campaña (para mostrar "hasta N unidades"); null si no hay tope. No incluye lo ya vendido. */
  totalUnits: number | null;
  /** true si la campaña tiene tope de unidades y ya no queda inventario (no se acepta ninguna compra más). */
  soldOut: boolean;
  questions: QuestionDefinition[];
  deliveryNote: string | null;
  /**
   * Métodos de entrega. Recolección: el cliente elige un punto. Envío: se cotiza con
   * POST /api/preventa/[slug]/envio antes de pagar; el costo se cobra en el mismo pago.
   */
  delivery: {
    pickup: { enabled: boolean; points: PickupPointInfo[] };
    shipping: { enabled: boolean };
  };
  /** Términos vigentes. El cliente debe aceptar exactamente esta versión. */
  terms: { version: number; content: string } | null;
};

/** POST /api/preventa/[slug]/reservas (JSON). Cabecera opcional `Idempotency-Key` (8–100 caracteres). */
export type CreateReservationRequest = {
  fullName: string;
  email: string;
  phone?: string;
  /** Por defecto 1. */
  quantity?: number;
  deliveryMethod: DeliveryMethod;
  /** Obligatorio con "pickup": id de `delivery.pickup.points`. */
  pickupPointId?: string;
  /** Obligatorio con "shipping". El teléfono del cliente también se vuelve obligatorio. */
  shipping?: { quoteId: string; optionId: string; address: DeliveryAddressInput };
  answers: Record<string, AnswerValue>;
  /** Debe ser true. */
  acceptTerms: boolean;
  /** `terms.version` que se mostró al cliente. Si cambió, la API responde 409 `terms_outdated`. */
  termsVersion: number;
  marketingConsent?: boolean;
  /** Honeypot: campo oculto que debe llegar vacío. */
  website?: string;
  /** utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer. */
  attribution?: Record<string, string>;
};

/** 201: redirigir al cliente a `checkoutUrl` (Stripe Checkout). */
export type CreateReservationResponse = {
  reservationCode: string;
  checkoutUrl: string;
  checkoutExpiresAt: string;
};

export type PublicReservationStatus = "pending_payment" | "processing" | "paid" | "payment_failed" | "expired" | "refunded" | "canceled";

/** GET /api/preventa/[slug]/confirmacion?session_id=cs_... */
export type ReservationStatusResponse = {
  reservationCode: string;
  status: PublicReservationStatus;
  productName: string;
  quantity: number;
  deliveryMethod: DeliveryMethod;
  /** Envío cobrado (centavos); 0 en recolección. Incluido en totalAmount. */
  shippingAmount: number;
  /** Recolección: punto elegido. */
  pickupPoint: { name: string; schedule: string } | null;
  /** Envío: paquetería y servicio elegidos al pagar. */
  shippingService: { carrier: string; service: string; days: number | null } | null;
  totalAmount: number;
  currency: string;
  fulfillmentStatus: FulfillmentStatus;
  /** Solo cuando el pedido ya se envió. */
  shipment: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null } | null;
  /** Correo enmascarado (p. ej. c***@gmail.com). */
  email: string;
  paidAt: string | null;
};

export type ApiErrorCode =
  | "not_found"
  | "presale_not_open"
  | "sold_out"
  | "presale_not_ready"
  | "terms_outdated"
  | "validation_error"
  | "rate_limited"
  | "idempotency_conflict"
  | "payment_unavailable"
  | "shipping_unavailable"
  | "shipping_no_rates"
  | "service_unavailable"
  | "invalid_signature";

/** Todos los errores: `{ error: { code, message, fieldErrors? } }`. */
export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Rutas tipo "email" o "answers.pregunta" → mensajes. */
    fieldErrors?: Record<string, string[]>;
    phase?: PresalePhase;
  };
};
