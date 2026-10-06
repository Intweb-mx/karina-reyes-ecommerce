"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addOrderNote } from "@inttimo/database";
import { audit, getAdminState } from "@/server/auth/admin";
import { fulfillReservation, handToCarrier, resendFulfillmentEmail, sendBonusIfEligible, type BonusOutcome, type FulfillmentAction, type Outcome } from "@/server/presale/fulfillment";
import { resendConfirmation } from "@/server/presale/notifications";
import { getDb, getFulfillmentDeps, getShippingDeps } from "@/server/presale/runtime";
import { generateLabel } from "@/server/presale/shipping";

function refresh(reservationId: string) {
  revalidatePath(`/panel/pedidos/${reservationId}`);
  revalidatePath("/panel");
}

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
  refresh(reservationId);
  const messages = ["Estado actualizado.", EMAIL[result.email], BONUS[result.bonus]].filter(Boolean);
  return result.email === "failed" || result.bonus === "failed" ? { error: messages.join(" ") } : { ok: messages.join(" ") };
}

export async function retryBonus(reservationId: string): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const outcome = await sendBonusIfEligible(getFulfillmentDeps(), reservationId);
  await audit(state.admin, { action: "reservation.bonus_retry", targetType: "reservation", targetId: reservationId, metadata: { outcome } });
  refresh(reservationId);
  if (outcome === "sent") return { ok: BONUS.sent };
  if (outcome === "skipped") return { error: "No aplica: el bonus ya se envió o el pedido aún no está enviado / listo para recoger." };
  return { error: BONUS[outcome] };
}

/** Compra la guía en SkyDropX (descuenta saldo de la cuenta) y deja el pedido en preparación; al cliente solo se le avisa con `handToCarrierAction`. */
export async function createLabel(reservationId: string): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const result = await generateLabel(getShippingDeps(), reservationId, state.admin.email);
  await audit(state.admin, { action: "reservation.label", targetType: "reservation", targetId: reservationId, metadata: result.ok ? { status: result.status } : { error: result.error } });
  refresh(reservationId);
  return result.ok ? { ok: result.message } : { error: result.error };
}

/** El paquete ya se entregó a la paquetería: marca ENVIADO, avisa con la guía y libera el bonus. */
export async function handToCarrierAction(reservationId: string): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const result = await handToCarrier(getFulfillmentDeps(), reservationId, state.admin.email);
  if (!result.ok) return { error: result.error };
  await audit(state.admin, { action: "reservation.hand_to_carrier", targetType: "reservation", targetId: reservationId });
  refresh(reservationId);
  const messages = ["Pedido marcado como ENVIADO.", EMAIL[result.email], BONUS[result.bonus]].filter(Boolean);
  return result.email === "failed" || result.bonus === "failed" ? { error: messages.join(" ") } : { ok: messages.join(" ") };
}

const noteSchema = z.string().trim().min(1, "Escribe la nota.").max(2000, "La nota es demasiado larga (máximo 2000 caracteres).");

export async function addNote(reservationId: string, _state: DeliveryState, form: FormData): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const parsed = noteSchema.safeParse(form.get("body"));
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };
  try {
    await addOrderNote(getDb(), { reservationId, body: parsed.data, authorEmail: state.admin.email });
  } catch {
    return { error: "No se pudo guardar la nota. Recarga la página e inténtalo de nuevo." };
  }
  await audit(state.admin, { action: "reservation.note", targetType: "reservation", targetId: reservationId });
  refresh(reservationId);
  return { ok: "Nota guardada." };
}

export async function resendEmail(reservationId: string, kind: "confirmation" | "fulfillment"): Promise<DeliveryState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  if (kind !== "confirmation" && kind !== "fulfillment") return { error: "Correo no válido." };
  const deps = getFulfillmentDeps();
  const outcome = kind === "confirmation" ? await resendConfirmation(getDb(), reservationId, { send: deps.send }) : await resendFulfillmentEmail(deps, reservationId);
  if (outcome === "sent" || outcome === "failed") {
    await audit(state.admin, { action: "reservation.resend_email", targetType: "reservation", targetId: reservationId, metadata: { kind, outcome } });
    refresh(reservationId);
  }
  if (outcome === "sent") return { ok: "Correo reenviado." };
  if (outcome === "failed") return { error: "No se pudo enviar el correo (quedó en el historial). Inténtalo más tarde." };
  return { error: "Este correo no aplica para el estado actual del pedido." };
}
