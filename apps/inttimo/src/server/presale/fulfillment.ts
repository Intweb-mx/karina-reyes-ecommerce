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
import { bonusMail, fulfillmentMail, type MailSender } from "./notifications.ts";

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

  const campaign = await getCampaignById(deps.db, updated.campaignId);
  let email: Outcome = "sent";
  try {
    const point = campaign?.pickupPoints.find((p) => p.id === updated.pickupPointId);
    await deps.send(fulfillmentMail(updated, campaign?.productName ?? "inttimo", action.note?.trim() || null, point));
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_SENT", "panel", { metadata: { status: updated.fulfillmentStatus } });
  } catch (error) {
    email = "failed";
    await addReservationEvent(deps.db, updated.id, "FULFILLMENT_EMAIL_FAILED", "panel", { metadata: { error: String(error).slice(0, 300) } });
  }

  const bonus = await sendBonusIfEligible(deps, updated.id);
  return { ok: true, reservation: updated, email, bonus };
}

/**
 * Envía el enlace del bonus si la campaña lo tiene, la compra se pagó dentro del periodo de preventa
 * y el pedido ya está enviado / listo / entregado. Idempotente: solo un envío exitoso por pedido.
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
