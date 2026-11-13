"use server";

import { z } from "zod";
import { audit, getAdminState } from "@/server/auth/admin";
import { getFulfillmentDeps } from "@/server/presale/runtime";
import { resendStoreDownloads } from "@/server/store/notifications";

export type ResendDownloadState = { error?: string; ok?: string } | undefined;

const folio = z.string().trim().toUpperCase().regex(/^INT-[2-9A-HJ-NP-Z]{10}$/, "Escribe el folio completo, p. ej. INT-7K2M9QX4TB.");

/** Manda al correo de la compra un enlace nuevo de descarga (los anteriores sin usar dejan de servir). */
export async function resendDownloadAction(_state: ResendDownloadState, form: FormData): Promise<ResendDownloadState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };
  const parsed = folio.safeParse(form.get("orderNumber"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Folio no válido." };

  const deps = getFulfillmentDeps();
  const result = await resendStoreDownloads(deps.db, parsed.data, { send: deps.send, siteUrl: deps.siteUrl, actor: state.admin.email });
  await audit(state.admin, { action: "store_order.download_resend", targetType: "store_order", targetId: parsed.data, metadata: { outcome: result.status } });
  if (result.status !== "sent") return { error: result.message };
  const [user, domain] = result.email.split("@");
  return { ok: `Listo: enviamos un enlace nuevo a ${user!.slice(0, 2)}•••@${domain} (el correo de la compra).` };
}
