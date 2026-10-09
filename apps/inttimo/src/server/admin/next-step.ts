import type { PresaleReservation } from "@inttimo/database";
import type { NextStep } from "./contract.ts";

export type NextStepInput = Pick<PresaleReservation, "status" | "deliveryMethod" | "fulfillmentStatus" | "trackingNumber" | "shipmentId" | "deliveryAddress" | "paymentMethod">;

/** Siguiente paso de un pedido (ver tabla en docs/panel-admin/subproyecto-1-diseno.md §2.1). */
export function nextStepFor(order: NextStepInput): NextStep {
  if (order.status !== "paid" && order.status !== "partially_refunded") return { type: "not_paid" };
  if (order.fulfillmentStatus === "delivered") return { type: "none" };
  if (order.deliveryMethod === "shipping") {
    if (order.fulfillmentStatus === "shipped") return { type: "mark_delivered" };
    if (order.trackingNumber) return { type: "hand_to_carrier" };
    return { type: "generate_label", blocked: order.deliveryAddress ? null : "missing_address", inProgress: !!order.shipmentId };
  }
  // Venta registrada a mano: el cliente estuvo en persona, no hay que avisarle que está listo.
  if (order.paymentMethod !== "stripe") return { type: "mark_picked_up" };
  return order.fulfillmentStatus === "ready_for_pickup" ? { type: "mark_picked_up" } : { type: "notify_ready" };
}
