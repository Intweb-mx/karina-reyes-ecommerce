"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, getAdminState } from "@/server/auth/admin";
import { sendBonusToAll } from "@/server/presale/fulfillment";
import { getFulfillmentDeps } from "@/server/presale/runtime";

export type BulkBonusState = { error?: string; ok?: string } | undefined;

/** Manda el bonus a todas las compras pagadas de la preventa, sin límite de fecha ni de estado de entrega. */
export async function sendBonusToAllAction(campaignId: string, _state: BulkBonusState, form: FormData): Promise<BulkBonusState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  if (!z.uuid().safeParse(campaignId).success) return { error: "Preventa no válida." };
  const includeAlreadySent = form.get("includeAlreadySent") === "on";

  const result = await sendBonusToAll(getFulfillmentDeps(), campaignId, state.admin.email, { includeAlreadySent });
  await audit(state.admin, { action: "campaign.bonus_bulk", targetType: "campaign", targetId: campaignId, metadata: typeof result === "string" ? { outcome: result, includeAlreadySent } : { ...result, includeAlreadySent } });
  revalidatePath("/panel/preventa");
  revalidatePath("/panel");

  if (result === "not_configured") return { error: "La campaña aún no tiene bonus configurado." };
  const summary = `Bonus enviado a ${result.sent} ${result.sent === 1 ? "persona" : "personas"}.`;
  if (result.failed) return { error: `${summary} ${result.failed} no se pudieron enviar (quedó en el historial de cada pedido): vuelve a presionar el botón para reintentar solo esos.` };
  if (!result.sent) return { ok: "No había a quién enviarlo: todas las compras con correo ya lo tienen." };
  return { ok: summary };
}
