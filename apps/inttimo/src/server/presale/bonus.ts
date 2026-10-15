import { getCampaignById, lastBonusLinkAt, openBonusLink, type BonusConfig, type Database } from "@inttimo/database";
import { hashBonusToken, reissueBonus, type FulfillmentDeps } from "./fulfillment.ts";

/** Intervalo mínimo entre correos de reenvío a una misma compra: frena el abuso y evita invalidar el enlace recién enviado. */
export const BONUS_RESEND_COOLDOWN_MS = 10 * 60_000;

/** Vida de las URLs firmadas: lo bastante para ver el video completo, no para compartirlo después. */
const VIDEO_URL_SECONDS = 3600;
const PDF_URL_SECONDS = 300;

/** Lo único que el bonus necesita del almacenamiento privado (así las pruebas no dependen de un proveedor). */
export type BonusStorage = {
  getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string>;
};

export type BonusAccess =
  | { status: "ok"; productName: string; bonus: BonusConfig; }
  | { status: "expired"; productName: string }
  | { status: "invalid" };

const TOKEN = /^[\w-]{43}$/;

/** Resuelve un enlace de bonus. Un token desconocido y uno mal formado responden igual (sin pistas). */
export async function resolveBonusAccess(db: Database, token: string, now: Date = new Date()): Promise<BonusAccess> {
  if (!TOKEN.test(token)) return { status: "invalid" };
  const found = await openBonusLink(db, hashBonusToken(token));
  if (!found) return { status: "invalid" };
  const campaign = await getCampaignById(db, found.reservation.campaignId);
  if (!campaign?.bonus) return { status: "invalid" };
  // Un reembolso total retira el beneficio.
  if (found.reservation.status !== "paid" && found.reservation.status !== "partially_refunded") return { status: "invalid" };
  if (found.link.expiresAt && found.link.expiresAt <= now) return { status: "expired", productName: campaign.productName };
  return {
    status: "ok",
    productName: campaign.productName,
    bonus: campaign.bonus,
  };
}

type Deps = { db: Database; storage: BonusStorage };

/** `unavailable`: el bonus usa ligas directas (sin archivo propio), no hay nada que firmar. */
export type BonusGrant<T> = ({ status: "ok" } & T) | { status: "expired" | "invalid" | "unavailable" };

/** Entrega una URL temporal del video, sin tope de reproducciones. La liga real del archivo no sale del servidor. */
export async function grantBonusVideo({ db, storage }: Deps, token: string, now: Date = new Date()): Promise<BonusGrant<{ url: string }>> {
  const access = await resolveBonusAccess(db, token, now);
  if (access.status !== "ok") return { status: access.status };
  const key = access.bonus.videoKey;
  if (!key) return { status: "unavailable" };
  return { status: "ok", url: await storage.getSignedUrl(key, { expiresInSeconds: VIDEO_URL_SECONDS }) };
}

const fileName = (title: string) => `${title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "bonus"}.pdf`;

/** URL temporal para descargar el PDF. Sin tope de descargas: es un documento para imprimir o guardar. */
export async function grantBonusPdf({ db, storage }: Deps, token: string, now: Date = new Date()): Promise<BonusGrant<{ url: string }>> {
  const access = await resolveBonusAccess(db, token, now);
  if (access.status !== "ok") return { status: access.status };
  const key = access.bonus.pdfKey;
  if (!key) return { status: "unavailable" };
  return { status: "ok", url: await storage.getSignedUrl(key, { expiresInSeconds: PDF_URL_SECONDS, downloadName: fileName(access.bonus.title) }) };
}

export type BonusResend =
  | { status: "sent"; emailHint: string }
  | { status: "too_soon" | "still_valid" | "failed" | "unavailable" | "invalid" };

/** `ana.perez@ejemplo.com` → `an•••@ejemplo.com`: confirma a dónde salió el correo sin exponerlo completo. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}

/**
 * El cliente pide que le reenvíen su bonus desde un enlace retirado (porque se emitió uno nuevo). Siempre va al correo
 * de la compra, nunca a uno capturado aquí, y solo si el enlace de verdad dejó de servir. Un enlace nuevo retira el anterior, por eso hay intervalo mínimo.
 */
export async function resendBonusByToken(deps: FulfillmentDeps, token: string): Promise<BonusResend> {
  if (!TOKEN.test(token)) return { status: "invalid" };
  const now = deps.now?.() ?? new Date();
  const found = await openBonusLink(deps.db, hashBonusToken(token));
  if (!found) return { status: "invalid" };
  if (!found.link.expiresAt || found.link.expiresAt > now) return { status: "still_valid" };
  const last = await lastBonusLinkAt(deps.db, found.reservation.id);
  if (last && now.getTime() - last.getTime() < BONUS_RESEND_COOLDOWN_MS) return { status: "too_soon" };
  const outcome = await reissueBonus(deps, found.reservation.id, "cliente", "api");
  if (outcome === "sent") return { status: "sent", emailHint: maskEmail(found.reservation.email!) };
  return { status: outcome === "failed" ? "failed" : "unavailable" };
}
