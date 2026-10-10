import type { PresaleEventType, PresaleReservation } from "@inttimo/database";
import type { IncidentType } from "./contract.ts";

export type IncidentInput = Pick<
  PresaleReservation,
  "status" | "email" | "deliveryMethod" | "fulfillmentStatus" | "deliveryAddress" | "shippingAddress" | "trackingNumber" | "paidAt" | "confirmationEmailSentAt" | "bonusSentAt" | "stripeCheckoutSessionId" | "createdAt"
>;
type IncidentEvent = { type: string; createdAt: Date };

/** Eventos que hacen falta para calcular incidencias (para no traer el historial completo de cada pedido). */
export const INCIDENT_EVENT_TYPES: PresaleEventType[] = ["LABEL_CREATED", "LABEL_FAILED", "FULFILLMENT_EMAIL_SENT", "FULFILLMENT_EMAIL_FAILED", "BONUS_SENT", "BONUS_FAILED"];

const CONFIRMATION_GRACE_MS = 15 * 60_000;
const UNSETTLED_MS = 24 * 3_600_000;

/** Último evento (los eventos vienen del más antiguo al más reciente) de entre `types`. */
function last(events: IncidentEvent[], types: string[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (types.includes(events[i]!.type)) return events[i]!.type;
  return null;
}

/** Problemas abiertos de un pedido. Se calculan, no se guardan: desaparecen cuando un evento posterior los resuelve. */
export function incidentsFor(order: IncidentInput, events: IncidentEvent[], now: Date): IncidentType[] {
  const incidents: IncidentType[] = [];
  if (order.status === "paid" || order.status === "partially_refunded") {
    if (order.fulfillmentStatus === "pending" && !order.trackingNumber && last(events, ["LABEL_CREATED", "LABEL_FAILED"]) === "LABEL_FAILED") incidents.push("label_failed");
    if (order.email && !order.confirmationEmailSentAt && order.paidAt && now.getTime() - order.paidAt.getTime() > CONFIRMATION_GRACE_MS) incidents.push("confirmation_email_failed");
    if (last(events, ["FULFILLMENT_EMAIL_SENT", "FULFILLMENT_EMAIL_FAILED"]) === "FULFILLMENT_EMAIL_FAILED") incidents.push("fulfillment_email_failed");
    if (!order.bonusSentAt && last(events, ["BONUS_SENT", "BONUS_FAILED"]) === "BONUS_FAILED") incidents.push("bonus_failed");
    if (order.deliveryMethod === "shipping" && order.fulfillmentStatus === "pending" && !order.deliveryAddress && !order.shippingAddress) incidents.push("missing_address");
  } else if ((order.status === "pending_payment" || order.status === "processing") && order.stripeCheckoutSessionId && now.getTime() - order.createdAt.getTime() > UNSETTLED_MS) {
    incidents.push("payment_unsettled");
  }
  return incidents;
}
