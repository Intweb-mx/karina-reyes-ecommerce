import { createHash } from "node:crypto";
import {
  addReservationEvent,
  findReservationById,
  getCampaignById,
  getCampaignBySlug,
  getShippingQuote,
  hitRateLimit,
  saveLabel,
  saveShippingQuote,
  type Database,
  type PresaleCampaign,
  type ShippingProfile,
  type ShippingQuote,
  type ShippingSelection,
} from "@inttimo/database";
import { z } from "zod";
import type { ContactAddress, Parcel, Rate, ShippingProvider } from "../shipping/provider.ts";
import { getPhase, isPublic } from "./campaign.ts";
import type { ApiError, ApiErrorCode, ShippingQuoteResponse } from "./contract.ts";
import type { ServiceResult } from "./reservations.ts";

/** Tiempo que la web respeta una cotización antes de pedir otra (SkyDropX la mantiene 24 h). */
const QUOTE_TTL_MINUTES = 120;
/** SkyDropX respeta el rate 24 h; con margen, después de esto se vuelve a cotizar al generar la guía. */
const RATE_VALID_HOURS = 23;
const RATE_LIMIT = { limit: 20, windowSeconds: 600 };

export type ShippingDeps = { db: Database; provider: ShippingProvider | null; now?: () => Date };

function fail(status: number, code: ApiErrorCode, message: string, extra: Partial<ApiError["error"]> = {}): ServiceResult<never> {
  return { ok: false, status, body: { error: { code, message, ...extra } } };
}

/** El envío a domicilio solo existe si la campaña lo habilita, tiene origen/paquete configurado y hay credenciales de SkyDropX. */
export function shippingAvailable(campaign: PresaleCampaign, provider: ShippingProvider | null): boolean {
  return campaign.shippingEnabled && campaign.shippingProfile !== null && provider !== null;
}

/** Paquete para N unidades: se suma el peso y se apilan las cajas. */
export function parcelFor(profile: ShippingProfile, quantity: number): Parcel {
  const { weightKg, lengthCm, widthCm, heightCm } = profile.parcel;
  return { weightKg: weightKg * quantity, lengthCm, widthCm, heightCm: heightCm * quantity };
}

/** Opciones que ve el cliente: la más económica y, si existe y es distinta, la más rápida (Política de Envíos §5). */
export function pickOptions(rates: Rate[], currency: string): (Rate & { id: "economico" | "express" })[] {
  const valid = rates.filter((rate) => rate.currency === currency);
  if (!valid.length) return [];
  const cheapest = [...valid].sort((a, b) => a.amount - b.amount || (a.days ?? 99) - (b.days ?? 99))[0]!;
  const fastest = [...valid].filter((rate) => rate.days !== null).sort((a, b) => a.days! - b.days! || a.amount - b.amount)[0];
  const options: (Rate & { id: "economico" | "express" })[] = [{ ...cheapest, id: "economico" }];
  if (fastest && fastest.rateId !== cheapest.rateId && (cheapest.days === null || fastest.days! < cheapest.days)) options.push({ ...fastest, id: "express" });
  return options;
}

const text = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max);

export const areaSchema = z.object({
  postalCode: z.string({ error: "Código postal de 5 dígitos." }).trim().regex(/^\d{5}$/, "Código postal de 5 dígitos."),
  state: text(60, "Indica el estado."),
  city: text(80, "Indica la ciudad o municipio."),
  neighborhood: text(100, "Indica la colonia."),
});

export const addressSchema = areaSchema.extend({
  street: text(120, "Indica calle y número."),
  reference: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || null),
});

const quoteRequestSchema = areaSchema.extend({ quantity: z.number().int().min(1).default(1) });

function fieldErrors(error: z.ZodError, prefix = ""): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = [prefix, ...issue.path.map(String)].filter(Boolean).join(".") || "_";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/** POST /api/preventa/[slug]/envio: cotiza con SkyDropX y guarda las opciones (el precio cobrado sale de aquí). */
export async function quoteShipping(deps: ShippingDeps, input: { slug: string; body: unknown; clientIp: string | null }): Promise<ServiceResult<ShippingQuoteResponse>> {
  const now = deps.now?.() ?? new Date();
  const campaign = await getCampaignBySlug(deps.db, input.slug);
  if (!campaign || !isPublic(campaign)) return fail(404, "not_found", "Preventa no encontrada.");
  if (getPhase(campaign, now) !== "open") return fail(409, "presale_not_open", "La preventa no está abierta.");
  if (!shippingAvailable(campaign, deps.provider)) return fail(409, "shipping_unavailable", "El envío a domicilio no está disponible. Puedes elegir recolección en Chihuahua.");

  const parsed = quoteRequestSchema.safeParse(input.body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa la dirección.", { fieldErrors: fieldErrors(parsed.error, "address") });
  const request = parsed.data;
  if (request.quantity > campaign.maxQuantityPerReservation) {
    return fail(400, "validation_error", "Revisa los datos del formulario.", { fieldErrors: { quantity: [`Máximo ${campaign.maxQuantityPerReservation} por compra.`] } });
  }

  if (input.clientIp && (await hitRateLimit(deps.db, `presale:quote:${hash(input.clientIp)}`, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds))) {
    return fail(429, "rate_limited", "Demasiadas cotizaciones. Espera unos minutos e inténtalo de nuevo.");
  }

  const profile = campaign.shippingProfile!;
  let result: { quotationId: string; rates: Rate[] };
  try {
    result = await deps.provider!.quote({ from: profile.origin, to: request, parcel: parcelFor(profile, request.quantity), carriers: profile.carriers });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "shipping_quote_failed", campaign: campaign.slug, error: String(error).slice(0, 500) }));
    return fail(503, "shipping_unavailable", "No pudimos cotizar el envío en este momento. Inténtalo de nuevo en unos minutos o elige recolección en Chihuahua.");
  }

  const options = pickOptions(result.rates, campaign.currency);
  if (!options.length) {
    console.warn(JSON.stringify({ level: "warn", msg: "shipping_no_rates", campaign: campaign.slug, postalCode: request.postalCode, rates: result.rates.length }));
    return fail(422, "shipping_no_rates", "No encontramos paqueterías para ese código postal. Revisa los datos o escríbenos para ayudarte.");
  }

  const quote = await saveShippingQuote(deps.db, {
    campaignId: campaign.id,
    quantity: request.quantity,
    postalCode: request.postalCode,
    quotationId: result.quotationId,
    options: options.map(({ id, rateId, carrier, service, days, amount }) => ({ id, rateId, carrier, service, days, amount })),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MINUTES * 60_000),
    createdAt: now,
  });

  return {
    ok: true,
    status: 200,
    data: {
      quoteId: quote.id,
      expiresAt: quote.expiresAt.toISOString(),
      currency: campaign.currency,
      options: quote.options.map(({ id, carrier, service, days, amount }) => ({ id: id as "economico" | "express", carrier, service, days, amount })),
    },
  };
}

/** Valida la opción elegida en el checkout contra la cotización guardada. Devuelve el cargo y la selección a guardar. */
export async function resolveShippingChoice(
  db: Database,
  campaign: PresaleCampaign,
  choice: { quoteId: string; optionId: string; postalCode: string; quantity: number },
  now: Date,
): Promise<{ ok: true; amount: number; selection: ShippingSelection } | { ok: false; field: string; message: string }> {
  const quote: ShippingQuote | null = /^[0-9a-f-]{36}$/i.test(choice.quoteId) ? await getShippingQuote(db, choice.quoteId) : null;
  if (!quote || quote.campaignId !== campaign.id) return { ok: false, field: "shipping", message: "Vuelve a calcular el envío." };
  if (quote.expiresAt <= now) return { ok: false, field: "shipping", message: "La cotización de envío expiró. Vuelve a calcularla." };
  if (quote.quantity !== choice.quantity) return { ok: false, field: "shipping", message: "Cambiaste la cantidad: vuelve a calcular el envío." };
  if (quote.postalCode !== choice.postalCode) return { ok: false, field: "address.postalCode", message: "El código postal cambió: vuelve a calcular el envío." };
  const option = quote.options.find((o) => o.id === choice.optionId);
  if (!option) return { ok: false, field: "shipping", message: "Elige una opción de envío." };
  return {
    ok: true,
    amount: option.amount,
    selection: { provider: "skydropx", quotationId: quote.quotationId, rateId: option.rateId, carrier: option.carrier, service: option.service, days: option.days, quotedAt: quote.createdAt.toISOString() },
  };
}

export type LabelResult = { ok: true; status: "ready" | "pending"; message: string } | { ok: false; error: string };

/**
 * Compra la guía en SkyDropX para un pedido pagado con envío y guarda paquetería y número de guía. El pedido sigue
 * EN PREPARACIÓN: pasa a ENVIADO (correo + bonus) solo con `handToCarrier`, cuando el paquete se entrega a la paquetería.
 * Si la cotización tiene más de 23 h se vuelve a cotizar y se elige la misma paquetería y servicio (o la más económica);
 * la diferencia la absorbe inttimo, el cliente ya pagó.
 */
export async function generateLabel(deps: ShippingDeps, reservationId: string, actor: string): Promise<LabelResult> {
  if (!deps.provider) return { ok: false, error: "SkyDropX no está configurado." };
  const reservation = await findReservationById(deps.db, reservationId);
  if (!reservation) return { ok: false, error: "Pedido no encontrado." };
  if (reservation.status !== "paid" && reservation.status !== "partially_refunded") return { ok: false, error: "Solo se generan guías de pedidos pagados." };
  if (reservation.deliveryMethod !== "shipping") return { ok: false, error: "Este pedido es con recolección." };
  if (reservation.fulfillmentStatus !== "pending") return { ok: false, error: "El pedido ya fue enviado." };
  if (reservation.trackingNumber) return { ok: false, error: "La guía ya está generada: imprímela y avisa cuando la entregues a la paquetería." };
  if (!reservation.deliveryAddress) return { ok: false, error: "El pedido no tiene dirección capturada: genera la guía manualmente en SkyDropX." };
  const campaign = await getCampaignById(deps.db, reservation.campaignId);
  if (!campaign?.shippingProfile) return { ok: false, error: "La campaña no tiene origen ni paquete configurados." };

  const now = deps.now?.() ?? new Date();
  const profile = campaign.shippingProfile;
  const to: ContactAddress = { ...reservation.deliveryAddress, company: null, email: reservation.email };

  let shipment;
  try {
    if (reservation.shipmentId) {
      shipment = await deps.provider.getShipment(reservation.shipmentId);
    } else {
      let { quotationId, rateId } = reservation.shippingSelection ?? { quotationId: "", rateId: "" };
      const quotedAt = reservation.shippingSelection ? new Date(reservation.shippingSelection.quotedAt) : new Date(0);
      if (!rateId || now.getTime() - quotedAt.getTime() > RATE_VALID_HOURS * 3_600_000) {
        const fresh = await deps.provider.quote({ from: profile.origin, to, parcel: parcelFor(profile, reservation.quantity), carriers: profile.carriers });
        const same = fresh.rates.find((r) => r.carrier === reservation.shippingSelection?.carrier && r.service === reservation.shippingSelection?.service);
        const chosen = same ?? pickOptions(fresh.rates, campaign.currency)[0];
        if (!chosen) return { ok: false, error: "SkyDropX no devolvió tarifas para esta dirección. Genera la guía manualmente." };
        ({ quotationId, rateId } = { quotationId: fresh.quotationId, rateId: chosen.rateId });
      }
      shipment = await deps.provider.createShipment({ quotationId, rateId, from: profile.origin, to, consignmentNote: profile.consignmentNote, packageType: profile.packageType });
      await saveLabel(deps.db, reservation.id, { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl });
      await addReservationEvent(deps.db, reservation.id, "LABEL_CREATED", "panel", { externalRef: shipment.shipmentId, metadata: { actor } });
    }
  } catch (error) {
    await addReservationEvent(deps.db, reservation.id, "LABEL_FAILED", "panel", { metadata: { actor, error: String(error).slice(0, 300) } });
    return { ok: false, error: "SkyDropX no pudo generar la guía. Revisa el saldo y los datos, o inténtalo de nuevo." };
  }

  if (!shipment.trackingNumber) {
    if (shipment.labelUrl && shipment.labelUrl !== reservation.labelUrl) await saveLabel(deps.db, reservation.id, { shipmentId: shipment.shipmentId, labelUrl: shipment.labelUrl });
    return { ok: true, status: "pending", message: "SkyDropX está generando la guía. Vuelve a presionar en unos minutos para traer el número de guía." };
  }

  await saveLabel(deps.db, reservation.id, {
    shipmentId: shipment.shipmentId,
    labelUrl: shipment.labelUrl,
    carrier: shipment.carrier ?? reservation.shippingSelection?.carrier ?? "Paquetería",
    trackingNumber: shipment.trackingNumber,
    trackingUrl: null,
  });
  return {
    ok: true,
    status: "ready",
    message: `Guía ${shipment.trackingNumber} lista. Imprímela y pégala en la caja; cuando entregues el paquete a la paquetería, presiona “Entregué el paquete a la paquetería”.`,
  };
}
