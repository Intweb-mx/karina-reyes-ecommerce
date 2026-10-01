import { createHash } from "node:crypto";
import {
  attachCheckoutSession,
  createReservation,
  findReservationByIdempotencyKey,
  findReservationBySessionId,
  getCampaignBySlug,
  getCurrentTerms,
  getRemainingUnits,
  hitRateLimit,
  InsufficientStockError,
  markCheckoutFailed,
  type Database,
  type PresaleReservation,
} from "@inttimo/database";
import { z } from "zod";
import { defaultDeliveryMethod, getPhase, isPublic, shippingCharge, toPublicCampaign } from "./campaign.ts";
import type { ApiError, ApiErrorCode, CreateReservationResponse, PublicCampaign, PublicReservationStatus, ReservationStatusResponse } from "./contract.ts";
import type { PaymentGateway } from "./gateway.ts";
import { buildAnswersSchema } from "./questionnaire.ts";
import { applySnapshot } from "./settlement.ts";

export type PresaleDeps = {
  db: Database;
  gateway: PaymentGateway;
  siteUrl: string;
  now?: () => Date;
  /** Se llama cuando una reserva queda pagada (envío idempotente de la confirmación). */
  onPaid?: (reservationId: string) => Promise<unknown>;
};

export type ServiceResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; body: ApiError };

const CHECKOUT_TTL_MINUTES = 60;
const RATE_LIMIT = { perIp: { limit: 10, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 600 } };

function fail(status: number, code: ApiErrorCode, message: string, extra: Partial<ApiError["error"]> = {}): ServiceResult<never> {
  return { ok: false, status, body: { error: { code, message, ...extra } } };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error as { code?: string; cause?: unknown } | undefined; current; current = current.cause as typeof current) {
    if (current.code === "23505") return true;
  }
  return false;
}

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer"] as const;

const baseRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre completo.").max(120),
  email: z.email("Correo no válido.").max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s().-]*$/, "Teléfono no válido.")
    .optional()
    .transform((value) => value || null),
  quantity: z.number().int().min(1).default(1),
  deliveryMethod: z.enum(["shipping", "pickup"], { error: "Elige recolección o envío a domicilio." }).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
  acceptTerms: z.literal(true, { error: "Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar." }),
  termsVersion: z.number({ error: "Falta la versión de los términos." }).int().positive(),
  marketingConsent: z.boolean().default(false),
  website: z.string().max(200).optional(),
  attribution: z
    .record(z.string(), z.string().max(200))
    .optional()
    .transform((value) => {
      if (!value) return null;
      const picked = Object.fromEntries(ATTRIBUTION_KEYS.filter((key) => value[key]).map((key) => [key, value[key]!]));
      return Object.keys(picked).length ? picked : null;
    }),
});

function fieldErrors(error: z.ZodError, prefix = ""): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = [prefix, ...issue.path.map(String)].filter(Boolean).join(".") || "_";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

// ---------- Campaña pública ----------

export async function getPublicCampaign(deps: Pick<PresaleDeps, "db" | "now">, slug: string): Promise<ServiceResult<PublicCampaign>> {
  const campaign = await getCampaignBySlug(deps.db, slug);
  if (!campaign || !isPublic(campaign)) return fail(404, "not_found", "Preventa no encontrada.");
  const terms = await getCurrentTerms(deps.db, campaign.id);
  const now = deps.now?.() ?? new Date();
  return { ok: true, status: 200, data: toPublicCampaign(campaign, terms, now, await getRemainingUnits(deps.db, campaign, now)) };
}

// ---------- Crear reserva ----------

function toCreateResponse(reservation: PresaleReservation): CreateReservationResponse {
  return {
    reservationCode: reservation.code,
    checkoutUrl: reservation.stripeCheckoutUrl!,
    checkoutExpiresAt: reservation.checkoutExpiresAt!.toISOString(),
  };
}

/** Repetición con la misma Idempotency-Key: devuelve la misma sesión mientras siga vigente. */
function replay(existing: PresaleReservation, campaignId: string, now: Date): ServiceResult<CreateReservationResponse> {
  if (
    existing.campaignId === campaignId &&
    existing.status === "pending_payment" &&
    existing.stripeCheckoutUrl &&
    existing.checkoutExpiresAt &&
    existing.checkoutExpiresAt > now
  ) {
    return { ok: true, status: 200, data: toCreateResponse(existing) };
  }
  return fail(409, "idempotency_conflict", "Esta solicitud ya se procesó. Recarga la página para iniciar una nueva reserva.");
}

export async function createPresaleReservation(
  deps: PresaleDeps,
  input: { slug: string; body: unknown; idempotencyKey: string | null; clientIp: string | null },
): Promise<ServiceResult<CreateReservationResponse>> {
  const now = deps.now?.() ?? new Date();
  const campaign = await getCampaignBySlug(deps.db, input.slug);
  if (!campaign || !isPublic(campaign)) return fail(404, "not_found", "Preventa no encontrada.");

  const phase = getPhase(campaign, now);
  if (phase !== "open") {
    return fail(409, "presale_not_open", phase === "upcoming" ? "La preventa aún no inicia." : "La preventa ya cerró.", { phase });
  }

  if (input.idempotencyKey !== null && !/^[\w-]{8,100}$/.test(input.idempotencyKey)) {
    return fail(400, "validation_error", "Idempotency-Key no válida (8–100 caracteres: letras, números, _ o -).");
  }

  // Datos y respuestas se validan juntos para mostrar todos los errores de una vez.
  const parsed = baseRequestSchema.safeParse(input.body);
  const rawAnswers = parsed.success ? parsed.data.answers : ((input.body as { answers?: unknown } | null)?.answers ?? {});
  const answers = buildAnswersSchema(campaign.questions).safeParse(rawAnswers);
  if (!parsed.success || !answers.success) {
    return fail(400, "validation_error", "Revisa los datos del formulario.", {
      fieldErrors: { ...(parsed.error ? fieldErrors(parsed.error) : {}), ...(answers.error ? fieldErrors(answers.error, "answers") : {}) },
    });
  }
  const request = parsed.data;

  // Honeypot: un bot llenó el campo oculto. Respuesta genérica, sin pistas.
  if (request.website) return fail(400, "validation_error", "Revisa los datos del formulario.");

  const terms = await getCurrentTerms(deps.db, campaign.id);
  if (!terms) {
    console.error(JSON.stringify({ level: "error", msg: "presale_without_terms", campaign: campaign.slug }));
    return fail(503, "presale_not_ready", "La preventa aún no está lista. Inténtalo más tarde.");
  }
  if (request.termsVersion !== terms.version) {
    return fail(409, "terms_outdated", "Los términos de la preventa se actualizaron. Revísalos y vuelve a aceptarlos.");
  }

  if (request.quantity > campaign.maxQuantityPerReservation) {
    return fail(400, "validation_error", "Revisa los datos del formulario.", {
      fieldErrors: { quantity: [`Máximo ${campaign.maxQuantityPerReservation} por reserva.`] },
    });
  }

  const deliveryMethod = request.deliveryMethod ?? defaultDeliveryMethod(campaign);
  if ((deliveryMethod === "pickup" && !campaign.pickupEnabled) || (deliveryMethod === "shipping" && !campaign.shippingEnabled)) {
    return fail(400, "validation_error", "Revisa los datos del formulario.", {
      fieldErrors: { deliveryMethod: [deliveryMethod === "pickup" ? "La recolección no está disponible en esta preventa." : "El envío a domicilio no está disponible en esta preventa."] },
    });
  }
  const shippingAmount = shippingCharge(campaign, deliveryMethod);

  if (input.idempotencyKey) {
    const existing = await findReservationByIdempotencyKey(deps.db, input.idempotencyKey);
    if (existing) return replay(existing, campaign.id, now);
  }

  const email = request.email.trim().toLowerCase();
  const limited =
    (input.clientIp && (await hitRateLimit(deps.db, `presale:ip:${hash(input.clientIp)}`, RATE_LIMIT.perIp.limit, RATE_LIMIT.perIp.windowSeconds))) ||
    (await hitRateLimit(deps.db, `presale:email:${hash(email)}`, RATE_LIMIT.perEmail.limit, RATE_LIMIT.perEmail.windowSeconds));
  if (limited) return fail(429, "rate_limited", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");

  let reservation: PresaleReservation;
  try {
    reservation = await createReservation(
      deps.db,
      {
        campaignId: campaign.id,
        fullName: request.fullName,
        email,
        phone: request.phone,
        quantity: request.quantity,
        unitAmount: campaign.unitAmount,
        currency: campaign.currency,
        deliveryMethod,
        shippingAmount,
        answers: answers.data,
        termsId: terms.id,
        marketingConsent: request.marketingConsent,
        idempotencyKey: input.idempotencyKey,
        attribution: request.attribution,
      },
      now,
    );
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      if (error.remaining === 0) return fail(409, "sold_out", "Las unidades de preventa se agotaron.");
      return fail(409, "sold_out", `Solo quedan ${error.remaining} unidades disponibles.`, {
        fieldErrors: { quantity: [`Solo quedan ${error.remaining} unidades disponibles.`] },
      });
    }
    if (input.idempotencyKey && isUniqueViolation(error)) {
      // Dos peticiones simultáneas con la misma clave: gana la primera.
      const existing = await findReservationByIdempotencyKey(deps.db, input.idempotencyKey);
      if (existing?.stripeCheckoutUrl) return replay(existing, campaign.id, now);
      return fail(409, "idempotency_conflict", "Tu reserva se está procesando. Espera un momento.");
    }
    throw error;
  }

  try {
    const base = deps.siteUrl.replace(/\/$/, "");
    const session = await deps.gateway.createCheckout({
      reservationId: reservation.id,
      reservationCode: reservation.code,
      campaignSlug: campaign.slug,
      productName: campaign.productName,
      unitAmount: campaign.unitAmount,
      currency: campaign.currency,
      quantity: reservation.quantity,
      deliveryMethod: reservation.deliveryMethod,
      shippingAmount: reservation.shippingAmount,
      email,
      successUrl: `${base}/preventa/${campaign.slug}/confirmacion?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/preventa/${campaign.slug}?cancelado=1`,
      expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MINUTES * 60_000),
    });
    await attachCheckoutSession(deps.db, reservation.id, session);
    return { ok: true, status: 201, data: { reservationCode: reservation.code, checkoutUrl: session.url, checkoutExpiresAt: session.expiresAt.toISOString() } };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "presale_checkout_create_failed", reservationId: reservation.id, error: String(error) }));
    await markCheckoutFailed(deps.db, reservation.id, String(error).slice(0, 300));
    return fail(503, "payment_unavailable", "No pudimos conectar con el sistema de pago. Inténtalo de nuevo en unos minutos.");
  }
}

// ---------- Estado de la reserva (página de confirmación) ----------

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

function publicStatus(status: PresaleReservation["status"]): PublicReservationStatus {
  return status === "partially_refunded" ? "paid" : status;
}

/**
 * Consulta por el id de sesión de Checkout (no adivinable, llega en la URL de éxito).
 * Si la reserva sigue pendiente pregunta a Stripe directamente: la confirmación no depende de que el webhook ya haya llegado.
 */
export async function getReservationStatus(
  deps: PresaleDeps,
  input: { slug: string; sessionId: string | null },
): Promise<ServiceResult<ReservationStatusResponse>> {
  if (!input.sessionId || !/^cs_[\w]{10,200}$/.test(input.sessionId)) return fail(400, "validation_error", "session_id no válido.");
  const campaign = await getCampaignBySlug(deps.db, input.slug);
  let reservation = campaign ? await findReservationBySessionId(deps.db, input.sessionId) : null;
  if (!campaign || !reservation || reservation.campaignId !== campaign.id) return fail(404, "not_found", "Reserva no encontrada.");

  if (reservation.status === "pending_payment" || reservation.status === "processing") {
    try {
      const snapshot = await deps.gateway.retrieveCheckout(input.sessionId);
      const current = reservation;
      const updated = await deps.db.transaction((tx) => applySnapshot(tx, current, snapshot, "sync", { source: "api", externalRef: snapshot.id }));
      if (updated) reservation = updated;
    } catch (error) {
      // Stripe no respondió: se muestra el último estado conocido; el webhook terminará de actualizarlo.
      console.error(JSON.stringify({ level: "warn", msg: "presale_status_sync_failed", reservationId: reservation.id, error: String(error) }));
    }
  }
  if (reservation.status === "paid" && !reservation.confirmationEmailSentAt) await deps.onPaid?.(reservation.id);

  return {
    ok: true,
    status: 200,
    data: {
      reservationCode: reservation.code,
      status: publicStatus(reservation.status),
      productName: campaign.productName,
      quantity: reservation.quantity,
      deliveryMethod: reservation.deliveryMethod,
      shippingAmount: reservation.shippingAmount,
      totalAmount: reservation.totalAmount,
      currency: reservation.currency,
      fulfillmentStatus: reservation.fulfillmentStatus,
      shipment:
        reservation.fulfillmentStatus === "shipped" || (reservation.fulfillmentStatus === "delivered" && reservation.trackingNumber)
          ? { carrier: reservation.carrier, trackingNumber: reservation.trackingNumber, trackingUrl: reservation.trackingUrl }
          : null,
      email: maskEmail(reservation.email),
      paidAt: reservation.paidAt?.toISOString() ?? null,
    },
  };
}
