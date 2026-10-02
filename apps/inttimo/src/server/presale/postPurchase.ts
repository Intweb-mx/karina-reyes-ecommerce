import { addReservationEvent, findReservationBySessionId, hitRateLimit, savePostPurchaseAnswers, type Database } from "@inttimo/database";
import { z } from "zod";
import { postPurchaseCopy } from "../../content/presale.ts";
import type { ApiError, ApiErrorCode, SavePostPurchaseAnswersResponse } from "./contract.ts";
import type { ServiceResult } from "./reservations.ts";

export type PostPurchaseDeps = { db: Database; now?: () => Date };

const RATE_LIMIT = { limit: 30, windowSeconds: 600 };

function fail(status: number, code: ApiErrorCode, message: string, extra: Partial<ApiError["error"]> = {}): ServiceResult<never> {
  return { ok: false, status, body: { error: { code, message, ...extra } } };
}

const answersSchema = z.object(
  Object.fromEntries(
    postPurchaseCopy.questions.map((q) => [q.id, "options" in q ? z.enum(q.options.map((o) => o.value) as [string, ...string[]]).optional() : z.string().trim().min(1).max(120).optional()]),
  ),
);

const requestSchema = z.object({
  sessionId: z.string().regex(/^cs_[\w]{10,200}$/, "session_id no válido."),
  answers: answersSchema,
  submit: z.boolean().default(false),
});

/**
 * POST /api/preventa/[slug]/postcompra: guarda (o reenvía) las respuestas del cuestionario opcional
 * posterior al pago. Solo para pedidos ya pagados ("Especificaciones finales postcompra UNO+UNO", §1).
 * No requiere `slug`: el `sessionId` de Stripe ya identifica el pedido sin ambigüedad.
 */
export async function savePostPurchaseAnswersService(deps: PostPurchaseDeps, input: { body: unknown; clientIp: string | null }): Promise<ServiceResult<SavePostPurchaseAnswersResponse>> {
  const parsed = requestSchema.safeParse(input.body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa tus respuestas.");

  if (input.clientIp && (await hitRateLimit(deps.db, `presale:postcompra:${input.clientIp}`, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds))) {
    return fail(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");
  }

  const reservation = await findReservationBySessionId(deps.db, parsed.data.sessionId);
  if (!reservation || reservation.status !== "paid") return fail(404, "not_found", "Pedido no encontrado.");

  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data.answers)) if (value !== undefined) answers[key] = value;
  await savePostPurchaseAnswers(deps.db, reservation.id, answers, parsed.data.submit);
  if (parsed.data.submit) await addReservationEvent(deps.db, reservation.id, "POST_PURCHASE_ANSWERS_SUBMITTED", "api", { metadata: { questions: Object.keys(answers) } });

  return { ok: true, status: 200, data: { saved: true } };
}
