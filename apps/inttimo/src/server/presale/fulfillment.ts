import { createHash, randomBytes } from "node:crypto";
import {
  addReservationEvent,
  claimBonusSend,
  createBonusLink,
  findReservationById,
  getCampaignById,
  listReservationEvents,
  markDelivered,
  markReadyForPickup,
  markShipped,
  releaseBonusSend,
  type Database,
  type PresaleReservation,
  type ShipmentDetails,
} from "@inttimo/database";
import { bonusMail, deliveredMail, fulfillmentMail, type BonusEmailInfo, type MailSender } from "./notifications.ts";

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
 * Avanza la entrega de un pedido pagado y avisa al cliente: LISTO PARA RECOGER y ENVIADO llevan sus instrucciones o
 * su guía; ENTREGADO manda el correo con el bonus (una sola vez). Un fallo de correo no revierte el cambio de
 * estado: queda en el historial y el bonus se puede reintentar.
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

  const campaign = await getCampaignById(deps.db, updated.campaignId);

  if (action.type === "delivered") return deliverWithBonus(deps, updated, campaign);

  const note = action.note?.trim() || null;
  const point = campaign?.pickupPoints.find((p) => p.id === updated.pickupPointId);
  let email: Outcome = "sent";
  try {
    await deps.send(fulfillmentMail(updated, campaign?.productName ?? "inttimo", note, point));
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: updated.fulfillmentStatus, bonusIncluded: false, note } });
  } catch (error) {
    email = "failed";
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { error: String(error).slice(0, 300), note } });
  }

  return { ok: true, reservation: updated, email, bonus: "skipped" };
}

/** ENTREGADO: reclama el bonus (idempotente), crea el enlace personal y lo manda en el correo de entrega. */
async function deliverWithBonus(deps: FulfillmentDeps, updated: PresaleReservation, campaign: Awaited<ReturnType<typeof getCampaignById>>): Promise<FulfillmentResult> {
  const config = campaign?.bonus;
  if (!campaign || !config) return { ok: true, reservation: updated, email: "skipped", bonus: "not_configured" };
  if (!updated.paidAt || updated.paidAt > campaign.endsAt) return { ok: true, reservation: updated, email: "skipped", bonus: "not_eligible" };

  const claimed = await claimBonusSend(deps.db, updated.id);
  if (!claimed) return { ok: true, reservation: updated, email: "skipped", bonus: "skipped" };

  const now = deps.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + config.linkDays * 86_400_000);
  const token = randomBytes(32).toString("base64url");
  try {
    await createBonusLink(deps.db, { reservationId: updated.id, tokenHash: hashBonusToken(token), expiresAt });
    const bonusInfo: BonusEmailInfo = { title: config.title, url: `${deps.siteUrl.replace(/\/$/, "")}/bonus/${token}`, expiresAt };
    await deps.send(deliveredMail(updated, campaign.productName, bonusInfo));
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: updated.fulfillmentStatus, bonusIncluded: true } });
    await addReservationEvent(deps.db, updated.id, "BONUS_SENT", "api", { metadata: { expiresAt: expiresAt.toISOString() } });
    return { ok: true, reservation: updated, email: "sent", bonus: "sent" };
  } catch (error) {
    await releaseBonusSend(deps.db, updated.id);
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { status: updated.fulfillmentStatus, error: String(error).slice(0, 300) } });
    await addReservationEvent(deps.db, updated.id, "BONUS_FAILED", "api", { metadata: { error: String(error).slice(0, 300) } });
    return { ok: true, reservation: updated, email: "failed", bonus: "failed" };
  }
}

/**
 * Envío: Karina entregó el paquete a la paquetería. Usa la guía ya generada en el panel; marca ENVIADO,
 * avisa al cliente con su número de guía (regla de Karina, 2026-10-02: guía generada ≠ enviado). El bonus sale al marcar ENTREGADO.
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

/** Reenvío manual del aviso de ENVIADO / LISTO PARA RECOGER, con la misma nota (el bonus tiene su propio reintento). */
export async function resendFulfillmentEmail(deps: FulfillmentDeps, reservationId: string): Promise<"sent" | "failed" | "not_applicable"> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation || (reservation.fulfillmentStatus !== "shipped" && reservation.fulfillmentStatus !== "ready_for_pickup")) return "not_applicable";
  const campaign = await getCampaignById(deps.db, reservation.campaignId);
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);
  const events = await listReservationEvents(deps.db, reservation.id);
  const previous = [...events].reverse().find((e) => (e.type === "FULFILLMENT_EMAIL_SENT" || e.type === "FULFILLMENT_EMAIL_FAILED") && typeof e.metadata.note === "string");
  const note = (previous?.metadata.note as string | undefined) ?? null;

  try {
    await deps.send(fulfillmentMail(reservation, campaign?.productName ?? "inttimo", note, point));
    await addReservationEvent(deps.db, reservation.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: reservation.fulfillmentStatus, bonusIncluded: false, manual: true, note } });
    return "sent";
  } catch (error) {
    await addReservationEvent(deps.db, reservation.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { manual: true, error: String(error).slice(0, 300), note } });
    return "failed";
  }
}

/**
 * Reintento manual desde el panel ("Reintentar bonus"): solo aplica a pedidos ENTREGADOS cuyo envío falló o nunca
 * se reclamó (bonusSentAt sigue null). Manda el bonus en un correo aparte: el de ENTREGADO ya se intentó.
 */
export async function sendBonusIfEligible(deps: FulfillmentDeps, reservationId: string): Promise<BonusOutcome> {
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation || reservation.fulfillmentStatus !== "delivered") return "skipped";
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
