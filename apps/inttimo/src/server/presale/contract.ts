/*
 * Contrato público de la API de preventa. El frontend puede importar estos
 * tipos directamente. Montos siempre en la unidad mínima de la moneda (centavos).
 */
import type { AnswerValue, QuestionDefinition } from "@inttimo/database";

export type PresalePhase = "upcoming" | "open" | "closed";

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
  questions: QuestionDefinition[];
  deliveryNote: string | null;
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
  totalAmount: number;
  currency: string;
  /** Correo enmascarado (p. ej. c***@gmail.com). */
  email: string;
  paidAt: string | null;
};

export type ApiErrorCode =
  | "not_found"
  | "presale_not_open"
  | "presale_not_ready"
  | "terms_outdated"
  | "validation_error"
  | "rate_limited"
  | "idempotency_conflict"
  | "payment_unavailable"
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
