import type { PresaleCampaign, PresaleTerms } from "@inttimo/database";
import type { PresalePhase, PublicCampaign } from "./contract.ts";

export const DEFAULT_DURATION_DAYS = 14;

/** Solo las campañas `active` son públicas; `draft` no existe para el público. */
export function isPublic(campaign: PresaleCampaign): boolean {
  return campaign.status !== "draft";
}

/** Método por defecto cuando el cliente no envía uno: envío si está habilitado (compatibilidad con el formulario anterior). */
export function defaultDeliveryMethod(campaign: Pick<PresaleCampaign, "shippingEnabled">): "shipping" | "pickup" {
  return campaign.shippingEnabled ? "shipping" : "pickup";
}

/** Envío cobrado en línea según el método elegido. */
export function shippingCharge(campaign: Pick<PresaleCampaign, "shippingAmount">, method: "shipping" | "pickup"): number {
  return method === "shipping" ? (campaign.shippingAmount ?? 0) : 0;
}

export function getPhase(campaign: PresaleCampaign, now: Date): PresalePhase {
  if (campaign.status === "closed" || now >= campaign.endsAt) return "closed";
  if (now < campaign.startsAt) return "upcoming";
  return "open";
}

export function toPublicCampaign(campaign: PresaleCampaign, terms: PresaleTerms | null, now: Date, remainingUnits: number | null = null): PublicCampaign {
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
    totalUnits: campaign.totalUnits,
    soldOut: remainingUnits !== null && remainingUnits <= 0,
    questions: campaign.questions,
    deliveryNote: campaign.deliveryNote,
    delivery: {
      pickup: campaign.pickupEnabled,
      shipping: { enabled: campaign.shippingEnabled, amount: campaign.shippingEnabled ? campaign.shippingAmount : null },
    },
    terms: terms ? { version: terms.version, content: terms.content } : null,
  };
}
