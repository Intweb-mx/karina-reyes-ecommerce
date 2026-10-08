import {
  getStoreSettings,
  getStoreShippingQuote,
  hitRateLimit,
  saveStoreShippingQuote,
  type Database,
  type ShippingProfile,
  type ShippingSelection,
  type StoreProduct,
  type StoreSettings,
} from "@inttimo/database";
import type { CartLine, DeliveryOptionsResponse, ShippingQuoteResponse, StoreErrorCode } from "../../lib/store/contract.ts";
import { areaSchema, pickOptions } from "../presale/shipping.ts";
import type { Parcel, Rate, ShippingProvider } from "../shipping/provider.ts";
import { isPurchasable, loadForSale } from "./catalog.ts";
import { fail, hash, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { cartLinesSchema, normalizeLines, sameLines } from "./lines.ts";
import { STORE_TERMS_VERSION } from "./terms.ts";

/** Tiempo que la web respeta una cotización (SkyDropX la mantiene 24 h). */
const QUOTE_TTL_MINUTES = 120;
const RATE_LIMIT = { limit: 20, windowSeconds: 600 };
const RATE_LABELS: Record<string, string> = { economico: "Envío económico", express: "Envío express" };

/** El envío a domicilio existe si está activo, tiene origen y paquete configurados y hay credenciales de SkyDropX. */
export function storeShippingAvailable(settings: StoreSettings | null, provider: ShippingProvider | null): settings is StoreSettings & { shippingProfile: ShippingProfile } {
  return !!settings && settings.shippingEnabled && settings.shippingProfile !== null && provider !== null;
}

/** GET /api/tienda/entrega */
export async function getDeliveryOptions(deps: Pick<StoreDeps, "db" | "shipping">): Promise<StoreResult<DeliveryOptionsResponse>> {
  const settings = await getStoreSettings(deps.db);
  const pickupEnabled = !!settings?.pickupEnabled && settings.pickupPoints.length > 0;
  return ok({
    pickup: { enabled: pickupEnabled, points: pickupEnabled ? settings!.pickupPoints.map(({ id, name, schedule }) => ({ id, name, schedule })) : [] },
    shipping: { enabled: storeShippingAvailable(settings, deps.shipping) },
    termsVersion: STORE_TERMS_VERSION,
  });
}

/**
 * Paquete del carrito con la misma regla que la preventa (`parcelFor`): se suman pesos, se apilan alturas y se toma el
 * mayor largo y ancho. Un producto sin peso o medidas usa el paquete por unidad de la configuración. Para UNO+UNO da el
 * mismo paquete que la preventa; con varios productos sobrestima el volumen (nunca se cobra de menos).
 */
export function cartParcel(items: { product: Pick<StoreProduct, "weightGrams" | "lengthCm" | "widthCm" | "heightCm">; quantity: number }[], fallback: ShippingProfile["parcel"]): Parcel {
  let weightKg = 0;
  let lengthCm = 0;
  let widthCm = 0;
  let heightCm = 0;
  for (const { product, quantity } of items) {
    const measured = !!(product.weightGrams && product.lengthCm && product.widthCm && product.heightCm);
    const unit = measured ? { weightKg: product.weightGrams! / 1000, lengthCm: product.lengthCm!, widthCm: product.widthCm!, heightCm: product.heightCm! } : fallback;
    weightKg += unit.weightKg * quantity;
    lengthCm = Math.max(lengthCm, unit.lengthCm);
    widthCm = Math.max(widthCm, unit.widthCm);
    heightCm += unit.heightCm * quantity;
  }
  return { weightKg: Math.round(weightKg * 1000) / 1000, lengthCm, widthCm, heightCm };
}

const quoteRequestSchema = areaSchema.extend({ lines: cartLinesSchema });

/** POST /api/tienda/envio/cotizar: cotiza el carrito con SkyDropX y guarda las opciones (el costo cobrado sale de aquí). */
export async function quoteStoreShipping(deps: Pick<StoreDeps, "db" | "shipping" | "now">, input: { body: unknown; clientIp: string | null }): Promise<StoreResult<ShippingQuoteResponse>> {
  const now = deps.now?.() ?? new Date();
  const settings = await getStoreSettings(deps.db);
  if (!storeShippingAvailable(settings, deps.shipping)) return fail(409, "service_unavailable", "El envío a domicilio no está disponible. Puedes elegir recolección en Chihuahua.");

  const parsed = quoteRequestSchema.safeParse(input.body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa la dirección.", zodFieldErrors(parsed.error));
  const { lines: rawLines, ...area } = parsed.data;
  const lines = normalizeLines(rawLines);

  const products = new Map((await loadForSale(deps.db, now)).map((product) => [product.id, product]));
  const items = lines.map((line) => ({ product: products.get(line.productId), quantity: line.quantity }));
  if (items.some(({ product }) => !product || !isPurchasable(product))) {
    return fail(409, "out_of_stock", "Revisa tu carrito: hay productos que ya no están disponibles.");
  }

  if (input.clientIp && (await hitRateLimit(deps.db, `store:quote:${hash(input.clientIp)}`, RATE_LIMIT.limit, RATE_LIMIT.windowSeconds))) {
    return fail(429, "rate_limited", "Demasiadas cotizaciones. Espera unos minutos e inténtalo de nuevo.");
  }

  const profile = settings.shippingProfile;
  const currency = items[0]!.product!.currency;
  let result: { quotationId: string; rates: Rate[] };
  try {
    result = await deps.shipping!.quote({ from: profile.origin, to: area, parcel: cartParcel(items.map(({ product, quantity }) => ({ product: product!, quantity })), profile.parcel), carriers: profile.carriers });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_shipping_quote_failed", error: String(error).slice(0, 500) }));
    return fail(503, "service_unavailable", "No pudimos cotizar el envío en este momento. Inténtalo de nuevo en unos minutos o elige recolección en Chihuahua.");
  }

  const options = pickOptions(result.rates, currency);
  if (!options.length) {
    console.warn(JSON.stringify({ level: "warn", msg: "store_shipping_no_rates", postalCode: area.postalCode, rates: result.rates.length }));
    return fail(422, "validation_error", "No encontramos paqueterías para ese código postal. Revisa los datos o escríbenos para ayudarte.");
  }

  const quote = await saveStoreShippingQuote(deps.db, {
    lines,
    postalCode: area.postalCode,
    quotationId: result.quotationId,
    currency,
    options: options.map(({ id, rateId, carrier, service, days, amount }) => ({ id, rateId, carrier, service, days, amount })),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MINUTES * 60_000),
    createdAt: now,
  });

  return ok({
    quoteId: quote.id,
    expiresAt: quote.expiresAt.toISOString(),
    rates: quote.options.map(({ id, carrier, service, days, amount }) => ({ id, label: RATE_LABELS[id] ?? "Envío", carrier, service, days, price: { amount, currency: quote.currency } })),
  });
}

export type ShippingChoice = { ok: true; amount: number; selection: ShippingSelection } | { ok: false; status: number; code: StoreErrorCode; field: string; message: string };

/** Valida en el checkout la tarifa elegida contra la cotización guardada: mismo carrito, mismo código postal, vigente. */
export async function resolveStoreShippingChoice(db: Database, choice: { quoteId: string; rateId: string; postalCode: string; lines: CartLine[] }, now: Date): Promise<ShippingChoice> {
  const expired = (field: string, message: string): ShippingChoice => ({ ok: false, status: 409, code: "quote_expired", field, message });
  const quote = await getStoreShippingQuote(db, choice.quoteId);
  if (!quote) return expired("shipping", "Vuelve a calcular el envío.");
  if (quote.expiresAt <= now) return expired("shipping", "La cotización de envío expiró. Vuelve a calcularla.");
  if (quote.postalCode !== choice.postalCode) return expired("address.postalCode", "El código postal cambió: vuelve a calcular el envío.");
  if (!sameLines(quote.lines, choice.lines)) return expired("shipping", "Cambiaste tu carrito: vuelve a calcular el envío.");
  const option = quote.options.find((candidate) => candidate.id === choice.rateId);
  if (!option) return { ok: false, status: 400, code: "validation_error", field: "shipping", message: "Elige una opción de envío." };
  return {
    ok: true,
    amount: option.amount,
    selection: { provider: "skydropx", quotationId: quote.quotationId, rateId: option.rateId, carrier: option.carrier, service: option.service, days: option.days, quotedAt: quote.createdAt.toISOString() },
  };
}
