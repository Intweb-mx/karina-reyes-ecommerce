import { createHash, randomBytes } from "node:crypto";
import {
  addReservationEvent,
  claimBonusSend,
  createBonusLink,
  findReservationById,
  getCampaignById,
  markDelivered,
  markReadyForPickup,
  markShipped,
  releaseBonusSend,
  type Database,
  type PresaleReservation,
  type ShipmentDetails,
} from "@inttimo/database";
import { bonusMail, fulfillmentMail, type BonusEmailInfo, type MailSender } from "./notifications.ts";

export type FulfillmentDeps = { db: Database; send: MailSender; siteUrl: string; now?: () => Date };

export type FulfillmentAction =
  | { type: "ready_for_pickup"; note?: string | null }
  | { type: "shipped"; shipment: ShipmentDetails; note?: string | null }
  | { type: "delivered" };

export type Outcome = "sent" | "failed" | "skipped";
export type BonusOutcome = Outcome | "not_configured" | "not_eligible";

export type FulfillmentResult =
  | { ok: true; reservation: PresaleReservation; email: Outcome; bonus: BonusOutcome }
  | { ok: false; error: string };

export function hashBonusToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Avanza la entrega de un pedido pagado, avisa al cliente y, al quedar enviado o listo para recoger,
 * libera el bonus (una sola vez). Un fallo de correo no revierte el cambio de estado: queda en el historial
 * y el bonus se puede reintentar.
 */
export async function fulfillReservation(deps: FulfillmentDeps, reservationId: string, action: FulfillmentAction, actor: string): Promise<FulfillmentResult> {
  const ctx = { source: "panel" as const, actor };
  const updated =
    action.type === "ready_for_pickup"
      ? await markReadyForPickup(deps.db, reservationId, ctx)
      : action.type === "shipped"
        ? await markShipped(deps.db, reservationId, action.shipment, ctx)
        : await markDelivered(deps.db, reservationId, ctx);

  if (!updated) {
    const current = await findReservationById(deps.db, reservationId);
    if (!current) return { ok: false, error: "Pedido no encontrado." };
    if (current.status !== "paid" && current.status !== "partially_refunded") return { ok: false, error: "Solo se pueden entregar pedidos pagados." };
    if (action.type === "ready_for_pickup" && current.deliveryMethod !== "pickup") return { ok: false, error: "Este pedido es con envío a domicilio." };
    if (action.type === "shipped" && current.deliveryMethod !== "shipping") return { ok: false, error: "Este pedido es con recolección." };
    return { ok: false, error: "El pedido ya cambió de estado. Recarga la página." };
  }

  if (action.type === "delivered") return { ok: true, reservation: updated, email: "skipped", bonus: "skipped" };

  const note = action.note?.trim() || null;
  const campaign = await getCampaignById(deps.db, updated.campaignId);
  const point = campaign?.pickupPoints.find((p) => p.id === updated.pickupPointId);

  // El bonus se reclama antes de enviar, para incluirlo DENTRO del mismo correo (§3): nunca un envío aparte.
  const eligibility = !campaign?.bonus ? "not_configured" : !updated.paidAt || updated.paidAt > campaign.endsAt ? "not_eligible" : "ok";
  let bonusInfo: BonusEmailInfo | null = null;
  if (eligibility === "ok") {
    const claimed = await claimBonusSend(deps.db, updated.id);
    if (claimed) {
      const now = deps.now?.() ?? new Date();
      const expiresAt = new Date(now.getTime() + campaign!.bonus!.linkDays * 86_400_000);
      const token = randomBytes(32).toString("base64url");
      await createBonusLink(deps.db, { reservationId: updated.id, tokenHash: hashBonusToken(token), expiresAt });
      bonusInfo = { title: campaign!.bonus!.title, url: `${deps.siteUrl.replace(/\/$/, "")}/bonus/${token}`, expiresAt };
    }
  }

  let email: Outcome = "sent";
  let bonus: BonusOutcome = bonusInfo ? "sent" : eligibility === "ok" ? "skipped" : eligibility;
  try {
    await deps.send(fulfillmentMail(updated, campaign?.productName ?? "inttimo", note, point, bonusInfo));
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: updated.fulfillmentStatus, bonusIncluded: !!bonusInfo, note } });
    if (bonusInfo) await addReservationEvent(deps.db, updated.id, "BONUS_SENT", "api", { metadata: { expiresAt: bonusInfo.expiresAt.toISOString() } });
  } catch (error) {
    email = "failed";
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { error: String(error).slice(0, 300), note } });
    if (bonusInfo) {
      bonus = "failed";
      await releaseBonusSend(deps.db, updated.id);
      await addReservationEvent(deps.db, updated.id, "BONUS_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    }
  }

  return { ok: true, reservation: updated, email, bonus };
}

/**
 * Envío: Karina entregó el paquete a la paquetería. Usa la guía ya generada en el panel; marca ENVIADO,
 * avisa al cliente con su número de guía y libera el bonus (regla de Karina, 2026-10-02: guía generada ≠ enviado).
 */
export async function handToCarrier(deps: FulfillmentDeps, reservationId: string, actor: string): Promise<FulfillmentResult> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation) return { ok: false, error: "Pedido no encontrado." };
  if (!reservation.trackingNumber || !reservation.carrier) return { ok: false, error: "Primero genera la guía." };
  return fulfillReservation(
    deps,
    reservationId,
    {
      type: "shipped",
      shipment: {
        carrier: reservation.carrier,
        trackingNumber: reservation.trackingNumber,
        trackingUrl: reservation.trackingUrl,
        shipmentId: reservation.shipmentId,
        labelUrl: reservation.labelUrl,
      },
    },
    actor,
  );
}

/**
 * Reintento manual desde el panel ("Reintentar bonus"): solo aplica si el envío anterior falló o nunca se
 * reclamó (bonusSentAt sigue null). Manda un correo de bonus aparte: el correo de ENVIADO/LISTO ya se mandó.
 */
export async function sendBonusIfEligible(deps: FulfillmentDeps, reservationId: string): Promise<BonusOutcome> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation) return "skipped";
  const campaign = await getCampaignById(deps.db, reservation.campaignId);
  if (!campaign?.bonus) return "not_configured";
  if (!reservation.paidAt || reservation.paidAt > campaign.endsAt) return "not_eligible";

  const claimed = await claimBonusSend(deps.db, reservation.id);
  if (!claimed) return "skipped";

  const now = deps.now?.() ?? new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + campaign.bonus.linkDays * 86_400_000);
  try {
    await createBonusLink(deps.db, { reservationId: reservation.id, tokenHash: hashBonusToken(token), expiresAt });
    const url = `${deps.siteUrl.replace(/\/$/, "")}/bonus/${token}`;
    await deps.send(bonusMail(claimed, campaign.productName, campaign.bonus.title, url, expiresAt));
    await addReservationEvent(deps.db, reservation.id, "BONUS_SENT", "api", { metadata: { expiresAt: expiresAt.toISOString() } });
    return "sent";
  } catch (error) {
    await releaseBonusSend(deps.db, reservation.id);
    await addReservationEvent(deps.db, reservation.id, "BONUS_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    return "failed";
  }
}
