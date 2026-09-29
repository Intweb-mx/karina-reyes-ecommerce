import type { PresaleCampaign, PresaleTerms } from "@inttimo/database";
import type { PresalePhase, PublicCampaign } from "./contract.ts";

export const DEFAULT_DURATION_DAYS = 14;

/** Solo las campañas `active` son públicas; `draft` no existe para el público. */
export function isPublic(campaign: PresaleCampaign): boolean {
  return campaign.status !== "draft";
}

export function getPhase(campaign: PresaleCampaign, now: Date): PresalePhase {
  if (campaign.status === "closed" || now >= campaign.endsAt) return "closed";
  if (now < campaign.startsAt) return "upcoming";
  return "open";
}

export function toPublicCampaign(campaign: PresaleCampaign, terms: PresaleTerms | null, now: Date): PublicCampaign {
  return {
    slug: campaign.slug,
    productName: campaign.productName,
    unitAmount: campaign.unitAmount,
    currency: campaign.currency,
    maxQuantityPerReservation: campaign.maxQuantityPerReservation,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    serverTime: now.toISOString(),
    phase: getPhase(campaign, now),
    questions: campaign.questions,
    deliveryNote: campaign.deliveryNote,
    terms: terms ? { version: terms.version, content: terms.content } : null,
  };
}
