"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, getAdminState } from "@/server/auth/admin";
import { fulfillReservation, sendBonusIfEligible, type BonusOutcome, type FulfillmentAction, type Outcome } from "@/server/presale/fulfillment";
import { getFulfillmentDeps } from "@/server/presale/runtime";

export type DeliveryState = { error?: string; ok?: string } | undefined;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready_for_pickup"), note: optionalText(1000) }),
  z.object({
    type: z.literal("shipped"),
    carrier: z.string().trim().min(1, "Indica la paquetería.").max(80),
    trackingNumber: z.string().trim().min(1, "Indica el número de guía.").max(80),
    trackingUrl: z
      .string()
      .trim()
      .max(500)
      .transform((value) => value || null)
      .pipe(z.url({ protocol: /^https?$/, error: "URL de rastreo no válida." }).nullable()),
    note: optionalText(1000),
  }),
  z.object({ type: z.literal("delivered") }),
]);

const EMAIL: Record<Outcome, string> = { sent: "Se avisó al cliente por correo.", failed: "No se pudo enviar el correo al cliente (quedó en el historial).", skipped: "" };
const BONUS: Record<BonusOutcome, string> = {
  sent: "Bonus enviado.",
  failed: "El bonus no se pudo enviar: usa “Reintentar bonus”.",
  skipped: "",
  not_configured: "La campaña aún no tiene bonus configurado.",
  not_eligible: "Compra fuera del periodo de preventa: sin bonus.",
};

export async function updateDelivery(reservationId: string, _state: DeliveryState, form: FormData): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };

  const input = parsed.data;
  const action: FulfillmentAction =
    input.type === "shipped"
      ? { type: "shipped", shipment: { carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl }, note: input.note }
      : input.type === "ready_for_pickup"
        ? { type: "ready_for_pickup", note: input.note }
        : { type: "delivered" };

  const result = await fulfillReservation(getFulfillmentDeps(), reservationId, action, state.admin.email);
  if (!result.ok) return { error: result.error };
  await audit(state.admin, { action: `reservation.${input.type}`, targetType: "reservation", targetId: reservationId });
  revalidatePath(`/panel/reservas/${reservationId}`);
  const messages = ["Estado actualizado.", EMAIL[result.email], BONUS[result.bonus]].filter(Boolean);
  return result.email === "failed" || result.bonus === "failed" ? { error: messages.join(" ") } : { ok: messages.join(" ") };
}

export async function retryBonus(reservationId: string): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const outcome = await sendBonusIfEligible(getFulfillmentDeps(), reservationId);
  await audit(state.admin, { action: "reservation.bonus_retry", targetType: "reservation", targetId: reservationId, metadata: { outcome } });
  revalidatePath(`/panel/reservas/${reservationId}`);
  if (outcome === "sent") return { ok: BONUS.sent };
  if (outcome === "skipped") return { error: "No aplica: el bonus ya se envió o el pedido aún no está enviado / listo para recoger." };
  return { error: BONUS[outcome] };
}
