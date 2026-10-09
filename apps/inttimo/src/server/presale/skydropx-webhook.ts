import { createHmac, timingSafeEqual } from "node:crypto";
import { findReservationByShipment, saveTrackingUrlIfMissing } from "@inttimo/database";
import { z } from "zod";
import { fulfillReservation, handToCarrier, type FulfillmentDeps } from "./fulfillment.ts";

/** Estatus de SkyDropX que significan "el paquete ya está en manos de la paquetería". */
const IN_CARRIER_HANDS = new Set(["picked_up", "in_transit", "last_mile", "delivery_attempt", "delivered_to_branch"]);

const packageEvent = z.object({
  data: z.object({
    type: z.literal("packages"),
    attributes: z.object({
      status: z.string(),
      tracking_number: z.string().min(1).nullish(),
      tracking_url_provider: z.string().nullish(),
    }),
    relationships: z.object({ shipment: z.object({ data: z.object({ id: z.string().min(1) }) }) }).optional(),
  }),
});

/** Firma HMAC-SHA512 en hexadecimal minúscula sobre el cuerpo crudo, enviada como `Authorization: HMAC <firma>`. */
export function verifySkydropxSignature(rawBody: string, header: string | null, secret: string): boolean {
  const match = header?.trim().match(/^HMAC\s+([0-9a-f]+)$/i);
  if (!match) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const received = match[1]!.toLowerCase();
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export type SkydropxOutcome = "ignored" | "unchanged" | "shipped" | "delivered";

/**
 * Aviso de rastreo de SkyDropX: "en camino" marca ENVIADO (correo con la guía) y "entregado" marca ENTREGADO (correo con el bonus).
 * Es idempotente y tolera avisos repetidos o fuera de orden: una transición que ya ocurrió no hace nada.
 */
export async function applySkydropxEvent(deps: FulfillmentDeps, body: unknown): Promise<SkydropxOutcome> {
  const parsed = packageEvent.safeParse(body);
  if (!parsed.success) return "ignored";
  const { attributes, relationships } = parsed.data.data;
  const status = attributes.status;
  if (!IN_CARRIER_HANDS.has(status) && status !== "delivered") return "ignored";

  const reservation = await findReservationByShipment(deps.db, { shipmentId: relationships?.shipment.data.id, trackingNumber: attributes.tracking_number });
  if (!reservation || reservation.deliveryMethod !== "shipping") return "ignored";
  if (reservation.status !== "paid" && reservation.status !== "partially_refunded") return "ignored";

  if (attributes.tracking_url_provider?.startsWith("https://")) await saveTrackingUrlIfMissing(deps.db, reservation.id, attributes.tracking_url_provider);

  let outcome: SkydropxOutcome = "unchanged";
  if (reservation.fulfillmentStatus === "pending") {
    const shipped = await handToCarrier(deps, reservation.id, "skydropx", "skydropx");
    if (shipped.ok) outcome = "shipped";
  }
  if (status === "delivered") {
    const delivered = await fulfillReservation(deps, reservation.id, { type: "delivered" }, "skydropx", "skydropx");
    if (delivered.ok) outcome = "delivered";
  }
  return outcome;
}

export type SkydropxWebhookResult = { status: 200; body: { received: true; result: SkydropxOutcome } } | { status: 400 | 401; body: { error: string } };

/** Verifica la firma sobre el cuerpo crudo y, si es válida, aplica el aviso. Los eventos que no son de paquetes se aceptan sin efecto. */
export async function handleSkydropxWebhook(deps: FulfillmentDeps, secret: string, rawBody: string, authHeader: string | null): Promise<SkydropxWebhookResult> {
  if (!verifySkydropxSignature(rawBody, authHeader, secret)) return { status: 401, body: { error: "invalid_signature" } };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }
  return { status: 200, body: { received: true, result: await applySkydropxEvent(deps, body) } };
}
