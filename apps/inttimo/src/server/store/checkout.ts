import {
  attachStoreCheckoutSession,
  createStoreOrder,
  findStoreOrderByIdempotencyKey,
  getStoreSettings,
  hitRateLimit,
  InsufficientStoreStockError,
  InvalidStoreOrderError,
  markStoreCheckoutCreateFailed,
  releaseExpiredStoreOrders,
  StoreProductUnavailableError,
  type Database,
  type NewStoreOrder,
  type StoreOrder,
} from "@inttimo/database";
import { z } from "zod";
import type { CheckoutResponse } from "../../lib/store/contract.ts";
import { addressSchema } from "../presale/shipping.ts";
import { isPurchasable, loadForSale } from "./catalog.ts";
import { fail, hash, isUniqueViolation, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { cartLinesSchema, normalizeLines } from "./lines.ts";
import { resolveStoreShippingChoice, storeShippingAvailable } from "./shipping.ts";
import { STORE_TERMS_VERSION } from "./terms.ts";

/** Vigencia de la sesión de Stripe: 30 min (mínimo de Stripe, contado desde que la crea) + 1 min de margen por latencia y reloj. */
export const STORE_CHECKOUT_TTL_MINUTES = 31;
const RATE_LIMIT = { perIp: { limit: 10, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 600 } };
/** Liberación en bloque antes de reintentar una compra que falló por stock (la ruta caliente solo libera 10). */
const RETRY_RELEASE_LIMIT = 100;
const UNAVAILABLE = "Uno de los productos ya no está disponible. Revisa tu carrito.";
const PICK_POINT = "Elige el punto de recolección.";
const QUOTE_SHIPPING = "Calcula el envío y elige una opción.";

const phone = z.string().trim().max(30, "Teléfono no válido.").regex(/^[+\d\s().-]*$/, "Teléfono no válido.");

const checkoutSchema = z.object({
  contact: z.object({
    fullName: z.string({ error: "Escribe tu nombre completo." }).trim().min(2, "Escribe tu nombre completo.").max(120, "Nombre demasiado largo."),
    email: z.email("Correo no válido.").max(254, "Correo no válido."),
    phone: phone.optional().transform((value) => value || null),
  }),
  lines: cartLinesSchema,
  couponCode: z.string({ error: "Cupón no válido." }).trim().max(50, "Cupón no válido.").optional(),
  delivery: z.discriminatedUnion(
    "method",
    [
      z.object({ method: z.literal("pickup"), pickupPointId: z.string({ error: PICK_POINT }).trim().min(1, PICK_POINT).max(60, PICK_POINT) }),
      z.object({
        method: z.literal("shipping"),
        quoteId: z.string({ error: QUOTE_SHIPPING }).max(60, QUOTE_SHIPPING),
        rateId: z.string({ error: QUOTE_SHIPPING }).max(30, QUOTE_SHIPPING),
        address: addressSchema.extend({
          reference: z.string({ error: "Referencia no válida." }).trim().max(200, "Referencia demasiado larga.").optional().transform((value) => value || null),
          name: z.string({ error: "Indica quién recibe." }).trim().min(2, "Indica quién recibe.").max(120, "Nombre demasiado largo."),
          phone: phone.min(7, "La paquetería necesita un teléfono de contacto."),
        }),
      }),
    ],
    { error: "Elige cómo quieres recibir tu pedido." },
  ),
  acceptTerms: z.literal(true, { error: "Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar." }),
  termsVersion: z.number({ error: "Falta la versión de los términos." }).int("Versión de los términos no válida.").positive("Versión de los términos no válida."),
  marketingConsent: z.boolean({ error: "Preferencia de comunicación no válida." }).default(false),
  website: z.string({ error: "Revisa los datos marcados." }).max(200, "Revisa los datos marcados.").optional(),
});

/**
 * Ruta del error de Zod → clave que pinta CheckoutView: fullName, email, phone, deliveryMethod, pickupPointId,
 * address.<campo>, shipping, acceptTerms, lines.
 */
export function checkoutFieldKey(path: PropertyKey[]): string | null {
  const [head, second, ...rest] = path.map(String);
  if (head === "contact" && (second === "fullName" || second === "email" || second === "phone")) return second;
  if (head === "delivery") {
    if (second === "address") return rest.length ? `address.${rest.join(".")}` : null;
    if (second === "pickupPointId") return "pickupPointId";
    if (second === "quoteId" || second === "rateId") return "shipping";
    if (second === undefined || second === "method") return "deliveryMethod";
    return null;
  }
  if (head === "lines") return "lines";
  if (head === "acceptTerms") return "acceptTerms";
  return null;
}

/** Una sesión que vence en menos de esto ya no se ofrece: el cliente podría llegar a Stripe con la sesión caducada. */
const MIN_REPLAY_SESSION_MS = 2 * 60_000;

/** Quita correos de un texto de error antes de registrarlo o guardarlo (privacidad), y lo recorta. */
export function redactError(error: unknown): string {
  return String(error).replace(/[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, "[correo]").slice(0, 300);
}

/**
 * Misma Idempotency-Key. Devuelve la misma sesión si el pedido sigue pendiente y la sesión vigente; si no, dice la verdad
 * sobre lo ocurrido (nunca "ya se procesó" cuando no se cobró nada). No crea pedidos nuevos.
 */
function replay(order: StoreOrder, now: Date): StoreResult<CheckoutResponse> {
  switch (order.paymentStatus) {
    case "paid":
    case "authorized":
    case "partially_refunded":
    case "refunded":
      return fail(409, "validation_error", "Esta compra ya se procesó. Recarga la página para iniciar una nueva.");
    case "pending":
      if (!order.stripeCheckoutUrl || !order.checkoutExpiresAt) return fail(409, "validation_error", "Estamos preparando tu pago. Espera unos segundos e inténtalo de nuevo.");
      if (order.checkoutExpiresAt.getTime() - now.getTime() >= MIN_REPLAY_SESSION_MS) {
        return ok({ orderNumber: order.orderNumber, checkoutUrl: order.stripeCheckoutUrl, checkoutExpiresAt: order.checkoutExpiresAt.toISOString() });
      }
      return fail(409, "validation_error", "Este intento de pago no se completó. Recarga la página para intentarlo de nuevo.");
    default:
      return fail(409, "validation_error", "Este intento de pago no se completó. Recarga la página para intentarlo de nuevo.");
  }
}

/** Crea el pedido; si falta stock y había apartados vencidos sin liberar, libera en bloque y reintenta una vez. */
async function placeOrder(db: Database, order: NewStoreOrder, now: Date) {
  try {
    return await createStoreOrder(db, order, now);
  } catch (error) {
    if (!(error instanceof InsufficientStoreStockError)) throw error;
    const freed = await releaseExpiredStoreOrders(db, now, { limit: RETRY_RELEASE_LIMIT }).catch(() => 0);
    if (!freed) throw error;
    return createStoreOrder(db, order, now);
  }
}

/**
 * POST /api/tienda/checkout. Valida datos, entrega y términos; crea el pedido pendiente apartando stock (precios de la
 * base) y la sesión de Stripe Checkout. Nunca confía en precios ni totales del navegador.
 */
export async function createStoreCheckout(
  deps: Pick<StoreDeps, "db" | "gateway" | "shipping" | "siteUrl" | "now">,
  input: { body: unknown; idempotencyKey: string | null; clientIp: string | null },
): Promise<StoreResult<CheckoutResponse>> {
  const now = deps.now?.() ?? new Date();
  const base = deps.siteUrl.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SITE_URL no está configurada.");
  if (input.idempotencyKey !== null && !/^[\w-]{8,100}$/.test(input.idempotencyKey)) {
    return fail(400, "validation_error", "Idempotency-Key no válida (8–100 caracteres: letras, números, _ o -).");
  }

  const parsed = checkoutSchema.safeParse(input.body, { error: () => "Dato no válido." }); // texto por omisión en español para cualquier campo sin mensaje propio
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error, checkoutFieldKey);
    // Los problemas sin campo en pantalla (p. ej. la versión de los términos) viajan solo en el mensaje.
    const unmapped = parsed.error.issues.filter((issue) => checkoutFieldKey(issue.path) === null).map((issue) => issue.message);
    return fail(400, "validation_error", ["Revisa los datos marcados.", ...unmapped].join(" "), fieldErrors);
  }
  const request = parsed.data;
  // Campo trampa: un bot llenó el campo oculto. Respuesta genérica, sin pistas.
  if (request.website) return fail(400, "validation_error", "Revisa los datos marcados.");
  if (request.couponCode) return fail(422, "validation_error", "Este cupón no es válido.", { couponCode: ["Este cupón no es válido."] });
  if (request.termsVersion !== STORE_TERMS_VERSION) return fail(409, "terms_outdated", "Los Términos y Condiciones se actualizaron. Revísalos y vuelve a aceptarlos.");

  const lines = normalizeLines(request.lines);
  // Misma regla de venta que el catálogo: publicado, con contenido, con precio y no "próximamente".
  const forSale = new Map((await loadForSale(deps.db, now)).map((product) => [product.id, product]));
  if (lines.some((line) => !isPurchasable(forSale.get(line.productId) ?? { price: null, saleStatus: "coming_soon" }))) return fail(409, "out_of_stock", UNAVAILABLE, { lines: [UNAVAILABLE] });
  const nameOf = (productId: string) => forSale.get(productId)?.name ?? "Un producto";

  // Entrega: se decide antes de Stripe. El costo de envío sale de la cotización guardada.
  const settings = await getStoreSettings(deps.db);
  const deliveryError = (field: string, message: string) => fail(400, "validation_error", "Revisa los datos de entrega.", { [field]: [message] });
  const delivery = request.delivery;
  let orderDelivery: NewStoreOrder["delivery"];
  let shippingAmount = 0;
  let shippingLabel: string | null = null;
  if (delivery.method === "pickup") {
    if (!settings?.pickupEnabled || !settings.pickupPoints.length) return deliveryError("deliveryMethod", "La recolección no está disponible.");
    const point = settings.pickupPoints.find((candidate) => candidate.id === delivery.pickupPointId);
    if (!point) return deliveryError("pickupPointId", PICK_POINT);
    orderDelivery = { method: "pickup", pickupPointId: point.id };
  } else {
    if (!storeShippingAvailable(settings, deps.shipping)) return deliveryError("deliveryMethod", "El envío a domicilio no está disponible. Puedes elegir recolección en Chihuahua.");
    const choice = await resolveStoreShippingChoice(deps.db, { quoteId: delivery.quoteId, rateId: delivery.rateId, postalCode: delivery.address.postalCode, lines }, now);
    if (!choice.ok) return fail(choice.status, choice.code, choice.message, { [choice.field]: [choice.message] });
    const { name, phone: recipientPhone, street, neighborhood, city, state, postalCode, reference } = delivery.address;
    orderDelivery = { method: "shipping", address: { name, phone: recipientPhone, street, neighborhood, city, state, postalCode, reference }, selection: choice.selection };
    shippingAmount = choice.amount;
    shippingLabel = `Envío · ${choice.selection.carrier} ${choice.selection.service}`.trim();
  }

  if (input.idempotencyKey) {
    const existing = await findStoreOrderByIdempotencyKey(deps.db, input.idempotencyKey);
    if (existing) return replay(existing, now);
  }

  const email = request.contact.email.trim().toLowerCase();
  const limited =
    (input.clientIp && (await hitRateLimit(deps.db, `store:checkout:ip:${hash(input.clientIp)}`, RATE_LIMIT.perIp.limit, RATE_LIMIT.perIp.windowSeconds))) ||
    (await hitRateLimit(deps.db, `store:checkout:email:${hash(email)}`, RATE_LIMIT.perEmail.limit, RATE_LIMIT.perEmail.windowSeconds));
  if (limited) return fail(429, "rate_limited", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");

  let created: Awaited<ReturnType<typeof createStoreOrder>>;
  try {
    created = await placeOrder(
      deps.db,
      {
        contact: { fullName: request.contact.fullName, email, phone: request.contact.phone },
        lines,
        delivery: orderDelivery,
        shippingAmount,
        termsVersion: request.termsVersion,
        marketingConsent: request.marketingConsent,
        idempotencyKey: input.idempotencyKey,
        attribution: null,
      },
      now,
    );
  } catch (error) {
    if (error instanceof InsufficientStoreStockError) {
      const message = `${nameOf(error.productId)}: ${error.message}`;
      return fail(409, "out_of_stock", message, { lines: [message] });
    }
    if (error instanceof StoreProductUnavailableError) return fail(409, "out_of_stock", UNAVAILABLE, { lines: [UNAVAILABLE] });
    if (error instanceof InvalidStoreOrderError) return fail(400, "validation_error", error.message, { lines: [error.message] });
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await findStoreOrderByIdempotencyKey(deps.db, input.idempotencyKey);
      if (existing) return replay(existing, now);
    }
    throw error;
  }
  if (created.reused) return replay(created.order, now);

  const { order, items } = created;
  let session: { id: string; url: string; expiresAt: Date };
  try {
    session = await deps.gateway.createStoreCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      lines: items.map((item) => ({ name: item.name, unitAmount: item.unitAmount, quantity: item.quantity })),
      deliveryMethod: order.deliveryMethod,
      shippingAmount: order.shippingAmount,
      shippingLabel,
      email: order.email,
      successUrl: `${base}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/checkout?pago=cancelado`,
      // Se calcula justo antes de llamar a Stripe: una liberación lenta no debe dejarla bajo el mínimo de 30 min.
      expiresAt: new Date((deps.now?.() ?? new Date()).getTime() + STORE_CHECKOUT_TTL_MINUTES * 60_000),
    });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "store_checkout_create_failed", orderId: order.id, error: redactError(error) }));
    await markStoreCheckoutCreateFailed(deps.db, order.id, redactError(error));
    return fail(503, "service_unavailable", "No pudimos conectar con el sistema de pago. Inténtalo de nuevo en unos minutos.");
  }

  if (!(await attachStoreCheckoutSession(deps.db, order.id, session))) {
    // El pedido se cerró en paralelo: nadie debe poder pagar esa sesión.
    console.error(JSON.stringify({ level: "error", msg: "store_checkout_attach_failed", orderId: order.id, sessionId: session.id }));
    await deps.gateway.expireCheckout(session.id).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", msg: "store_checkout_expire_failed", sessionId: session.id, error: redactError(error) }));
    });
    return fail(503, "service_unavailable", "No pudimos preparar tu pago. Inténtalo de nuevo en unos minutos.");
  }

  return ok({ orderNumber: order.orderNumber, checkoutUrl: session.url, checkoutExpiresAt: session.expiresAt.toISOString() }, 201);
}
