import { getCampaignById, openBonusLink, refundBonusVideoPlay, takeBonusVideoPlay, type BonusConfig, type Database } from "@inttimo/database";
import { hashBonusToken } from "./fulfillment.ts";

/** Reproducciones del video por enlace personal: se limita para que no circule entre personas. */
export const BONUS_VIDEO_MAX_PLAYS = 3;

/** Vida de las URLs firmadas: lo bastante para ver el video completo, no para compartirlo después. */
const VIDEO_URL_SECONDS = 3600;
const PDF_URL_SECONDS = 300;

/** Lo único que el bonus necesita del almacenamiento privado (así las pruebas no dependen de un proveedor). */
export type BonusStorage = {
  getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string>;
};

export type BonusAccess =
  | { status: "ok"; productName: string; bonus: BonusConfig; expiresAt: Date; linkId: string; videoPlaysLeft: number }
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
  if (found.link.expiresAt <= now) return { status: "expired", productName: campaign.productName };
  return {
    status: "ok",
    productName: campaign.productName,
    bonus: campaign.bonus,
    expiresAt: found.link.expiresAt,
    linkId: found.link.id,
    videoPlaysLeft: Math.max(0, BONUS_VIDEO_MAX_PLAYS - found.link.videoPlays),
  };
}

type Deps = { db: Database; storage: BonusStorage };

/** `unavailable`: el bonus usa ligas directas (sin archivo propio), no hay nada que firmar. */
export type BonusGrant<T> = ({ status: "ok" } & T) | { status: "expired" | "invalid" | "unavailable" | "exhausted" };

/**
 * Entrega una URL temporal del video y gasta una reproducción. La liga real del archivo no sale del servidor.
 * El tope se aplica con un UPDATE condicional: solicitudes simultáneas no pasan de BONUS_VIDEO_MAX_PLAYS.
 */
export async function grantBonusVideo({ db, storage }: Deps, token: string, now: Date = new Date()): Promise<BonusGrant<{ url: string; playsLeft: number }>> {
  const access = await resolveBonusAccess(db, token, now);
  if (access.status !== "ok") return { status: access.status };
  const key = access.bonus.videoKey;
  if (!key) return { status: "unavailable" };

  const used = await takeBonusVideoPlay(db, access.linkId, BONUS_VIDEO_MAX_PLAYS);
  if (used === null) return { status: "exhausted" };
  try {
    const url = await storage.getSignedUrl(key, { expiresInSeconds: VIDEO_URL_SECONDS });
    return { status: "ok", url, playsLeft: Math.max(0, BONUS_VIDEO_MAX_PLAYS - used) };
  } catch (error) {
    await refundBonusVideoPlay(db, access.linkId); // si el almacenamiento falla, el cliente no pierde su reproducción
    throw error;
  }
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
