"use server";

import { getCampaignBySlug, getCurrentTerms, listReservations, publishTerms, updateCampaign } from "@inttimo/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, getAdminState } from "@/server/auth/admin";
import { questionsSchema } from "@/server/presale/questionnaire";
import { getDb } from "@/server/presale/runtime";

export type ActionState = { error?: string; ok?: string } | undefined;

/** México no tiene horario de verano desde 2022: CDMX es UTC-6 todo el año. */
const MX_OFFSET = "-06:00";
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha no válida.")
  .transform((value) => new Date(`${value}:00${MX_OFFSET}`));

const campaignSchema = z
  .object({
    productName: z.string().trim().min(1, "Nombre requerido.").max(120),
    status: z.enum(["draft", "active", "closed"]),
    startsAt: localDate,
    endsAt: localDate,
    price: z
      .string()
      .trim()
      .regex(/^\d{1,7}(\.\d{1,2})?$/, "Precio no válido (ej. 999.00).")
      .transform((value) => Math.round(Number(value) * 100))
      .refine((cents) => cents > 0, "El precio debe ser mayor a 0."),
    maxQuantityPerReservation: z.coerce.number().int().min(1).max(20),
    pickupEnabled: z.literal("on").optional().transform(Boolean),
    shippingEnabled: z.literal("on").optional().transform(Boolean),
    pickupPoints: z
      .string()
      .transform((value, ctx) => {
        try {
          return JSON.parse(value || "[]") as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Puntos de recolección: JSON no válido." });
          return z.NEVER;
        }
      })
      .pipe(z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/, "Id de punto: minúsculas, números y guiones."), name: z.string().trim().min(1).max(120), schedule: z.string().trim().min(1).max(200) }))),
    deliveryNote: z.string().trim().max(1000).transform((value) => value || null),
    questions: z.string().transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Preguntas: JSON no válido." });
        return z.NEVER;
      }
    }).pipe(questionsSchema),
    confirmPriceChange: z.literal("on").optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "El cierre debe ser posterior al inicio.", path: ["endsAt"] })
  .refine((v) => v.pickupEnabled || v.shippingEnabled, { message: "Activa al menos un método de entrega." })
  .refine((v) => !v.pickupEnabled || v.pickupPoints.length > 0, { message: "Con recolección activa, agrega al menos un punto." });

async function adminOrError() {
  const state = await getAdminState();
  return state.status === "ok" ? state.admin : null;
}

export async function saveCampaign(slug: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await adminOrError();
  if (!admin) return { error: "Sesión vencida. Vuelve a entrar." };

  const parsed = campaignSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  const input = parsed.data;

  const db = getDb();
  const campaign = await getCampaignBySlug(db, slug);
  if (!campaign) return { error: "Campaña no encontrada." };
  const reservations = await listReservations(db, campaign.id);

  if (reservations.length && input.price !== campaign.unitAmount && !input.confirmPriceChange) {
    return { error: `Ya hay ${reservations.length} reservas. Marca la casilla para confirmar el cambio de precio (las existentes conservan su precio).` };
  }
  if (reservations.length) {
    const removed = campaign.questions.map((q) => q.id).filter((id) => !input.questions.some((q) => q.id === id));
    if (removed.length) return { error: `Con reservas existentes no se pueden quitar preguntas (${removed.join(", ")}): se perderían respuestas. Puedes cambiar su texto u opciones.` };
    const usedPoints = new Set(reservations.flatMap((r) => (r.pickupPointId ? [r.pickupPointId] : [])));
    const missing = [...usedPoints].filter((id) => !input.pickupPoints.some((p) => p.id === id));
    if (missing.length) return { error: `Hay pedidos con los puntos ${missing.join(", ")}: no se pueden quitar. Puedes cambiar su nombre u horario.` };
  }
  if (input.status === "active" && !(await getCurrentTerms(db, campaign.id))) {
    return { error: "Publica los términos antes de activar la campaña." };
  }

  const patch = {
    productName: input.productName,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    unitAmount: input.price,
    maxQuantityPerReservation: input.maxQuantityPerReservation,
    pickupEnabled: input.pickupEnabled,
    shippingEnabled: input.shippingEnabled,
    pickupPoints: input.pickupPoints,
    deliveryNote: input.deliveryNote,
    questions: input.questions,
  };
  await updateCampaign(db, campaign.id, patch);

  const changed = Object.fromEntries(
    Object.entries(patch).flatMap(([key, value]) => {
      const before = campaign[key as keyof typeof patch];
      const same = JSON.stringify(before) === JSON.stringify(value);
      return same ? [] : [[key, { antes: before, despues: value }]];
    }),
  );
  if (Object.keys(changed).length) await audit(admin, { action: "campaign.update", targetType: "campaign", targetId: campaign.id, metadata: changed });

  revalidatePath(`/panel/campanas/${slug}`);
  revalidatePath(`/preventa/${slug}`);
  return { ok: Object.keys(changed).length ? "Cambios guardados." : "Sin cambios." };
}

export async function saveTerms(slug: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const admin = await adminOrError();
  if (!admin) return { error: "Sesión vencida. Vuelve a entrar." };

  const content = String(form.get("content") ?? "").trim();
  if (!content) return { error: "Los términos no pueden estar vacíos." };
  if (content.length > 50_000) return { error: "Los términos son demasiado largos (máx. 50,000 caracteres)." };

  const db = getDb();
  const campaign = await getCampaignBySlug(db, slug);
  if (!campaign) return { error: "Campaña no encontrada." };
  const current = await getCurrentTerms(db, campaign.id);
  if (current?.content === content) return { ok: `Sin cambios (versión ${current.version} vigente).` };

  const terms = await publishTerms(db, campaign.id, content, admin.email);
  await audit(admin, { action: "terms.publish", targetType: "campaign", targetId: campaign.id, metadata: { version: terms.version } });
  revalidatePath(`/panel/campanas/${slug}/editar`);
  revalidatePath(`/preventa/${slug}`);
  return { ok: `Versión ${terms.version} publicada. Las reservas nuevas deberán aceptarla.` };
}
