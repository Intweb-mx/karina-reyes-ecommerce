import { getCampaignById, openBonusLink, type BonusConfig, type Database } from "@inttimo/database";
import { hashBonusToken } from "./fulfillment.ts";

export type BonusAccess =
  | { status: "ok"; productName: string; bonus: BonusConfig; expiresAt: Date }
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
  return { status: "ok", productName: campaign.productName, bonus: campaign.bonus, expiresAt: found.link.expiresAt };
}
