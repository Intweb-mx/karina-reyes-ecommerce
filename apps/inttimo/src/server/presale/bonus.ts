import { getCampaignById, openBonusLink, type BonusConfig, type Database } from "@inttimo/database";
import { hashBonusToken } from "./fulfillment.ts";

/** Vida de cada URL firmada (se pide una nueva en cada apertura): lo bastante para ver el video completo. */
const VIDEO_URL_SECONDS = 3600;
const PDF_URL_SECONDS = 300;

/** Lo único que el bonus necesita del almacenamiento privado (así las pruebas no dependen de un proveedor). */
export type BonusStorage = {
  getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string>;
};

export type BonusAccess =
  | { status: "ok"; productName: string; bonus: BonusConfig }
  | { status: "invalid" };

const TOKEN = /^[\w-]{43}$/;

/**
 * Resuelve un enlace de bonus. Un token desconocido y uno mal formado responden igual (sin pistas).
 * Los enlaces no vencen ni se retiran (decisión 2026-10-22): `expires_at` de enlaces viejos se ignora a propósito.
 * Lo único que corta el acceso es un reembolso total.
 */
export async function resolveBonusAccess(db: Database, token: string): Promise<BonusAccess> {
  if (!TOKEN.test(token)) return { status: "invalid" };
  const found = await openBonusLink(db, hashBonusToken(token));
  if (!found) return { status: "invalid" };
  const campaign = await getCampaignById(db, found.reservation.campaignId);
  if (!campaign?.bonus) return { status: "invalid" };
  // Un reembolso total retira el beneficio.
  if (found.reservation.status !== "paid" && found.reservation.status !== "partially_refunded") return { status: "invalid" };
  return {
    status: "ok",
    productName: campaign.productName,
    bonus: campaign.bonus,
  };
}

type Deps = { db: Database; storage: BonusStorage };

/** `unavailable`: el bonus usa ligas directas (sin archivo propio), no hay nada que firmar. */
export type BonusGrant<T> = ({ status: "ok" } & T) | { status: "invalid" | "unavailable" };

/** Entrega una URL temporal del video, sin tope de reproducciones. La liga real del archivo no sale del servidor. */
export async function grantBonusVideo({ db, storage }: Deps, token: string): Promise<BonusGrant<{ url: string }>> {
  const access = await resolveBonusAccess(db, token);
  if (access.status !== "ok") return { status: access.status };
  const key = access.bonus.videoKey;
  if (!key) return { status: "unavailable" };
  return { status: "ok", url: await storage.getSignedUrl(key, { expiresInSeconds: VIDEO_URL_SECONDS }) };
}

const fileName = (title: string) => `${title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "bonus"}.pdf`;

/** URL temporal para descargar el PDF. Sin tope de descargas: es un documento para imprimir o guardar. */
export async function grantBonusPdf({ db, storage }: Deps, token: string): Promise<BonusGrant<{ url: string }>> {
  const access = await resolveBonusAccess(db, token);
  if (access.status !== "ok") return { status: access.status };
  const key = access.bonus.pdfKey;
  if (!key) return { status: "unavailable" };
  return { status: "ok", url: await storage.getSignedUrl(key, { expiresInSeconds: PDF_URL_SECONDS, downloadName: fileName(access.bonus.title) }) };
}
