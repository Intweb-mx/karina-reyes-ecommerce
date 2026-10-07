/*
 * CONTRATO PROPUESTO — Tienda inttimo (Fase 2).
 *
 * Estado: SOLICITUD para backend. El frontend ya consume estos tipos a través de `StoreApi` (api.ts);
 * hoy responde un adaptador simulado (mock.ts). Cuando existan los endpoints de `docs/store/BACKEND-REQUEST.md`,
 * se activa el adaptador HTTP (http.ts) con `NEXT_PUBLIC_STORE_API=http` sin cambiar pantallas.
 *
 * Convenciones (mismas que la preventa):
 * - Montos en centavos (`50000` = $500.00 MXN). El navegador nunca envía precios: el servidor los calcula.
 * - Fechas en ISO 8601.
 * - Errores: `{ error: { code, message, fieldErrors? } }` (ver StoreError).
 */

export type Money = { amount: number; currency: string };

export type ProductStatus = "available" | "low_stock" | "sold_out" | "presale" | "coming_soon";

export type ProductImage = { src: string; alt: string; width: number; height: number; /** Render de referencia, no foto aprobada. */ placeholder?: boolean };

/** Territorios del brief: lo que la pareja quiere cultivar (relación muchos-a-muchos con productos). */
export type TerritoryId = "conversacion" | "conexion" | "intimidad" | "disfrute" | "conocimiento" | "fe";

export type ProductSummary = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  tagline: string;
  type: "physical" | "digital";
  status: ProductStatus;
  price: Money | null;
  compareAtPrice: Money | null;
  image: ProductImage;
  territories: TerritoryId[];
  /** Unidades disponibles solo si el negocio decide mostrarlas (stock bajo). */
  availableUnits: number | null;
};

export type ProductDetail = ProductSummary & {
  description: string[];
  gallery: ProductImage[];
  includes: string[];
  howToPlay: { title: string; body: string }[];
  faqs: Faq[];
  maxQuantityPerOrder: number;
  related: ProductSummary[];
  seo: { title: string; description: string };
};

/** GET /api/tienda/productos */
export type CatalogResponse = { products: ProductSummary[] };

// ---------------------------------------------------------------------------------------------
// Carrito: el cliente guarda solo { productId, quantity }; el servidor devuelve precios y totales.

export type CartLine = { productId: string; quantity: number };

/** POST /api/tienda/carrito/cotizar */
export type CartQuoteRequest = { lines: CartLine[]; couponCode?: string };

export type CartQuoteLine = {
  productId: string;
  slug: string;
  name: string;
  image: ProductImage;
  unitPrice: Money;
  quantity: number;
  subtotal: Money;
  /** El servidor ajusta cantidades si no hay stock suficiente y lo explica aquí. */
  notice: string | null;
  available: boolean;
  maxQuantity: number;
};

export type CartQuoteResponse = {
  lines: CartQuoteLine[];
  subtotal: Money;
  discount: Money | null;
  coupon: { code: string; label: string } | null;
  couponError: string | null;
  /** Envío se calcula en checkout con la dirección. */
  total: Money;
};

// ---------------------------------------------------------------------------------------------
// Checkout

export type DeliveryMethod = "shipping" | "pickup";

export type PickupPoint = { id: string; name: string; schedule: string };

export type Address = {
  name: string;
  phone: string;
  street: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  state: string;
  reference?: string;
};

/** GET /api/tienda/entrega → opciones de entrega y versión vigente de los Términos (el checkout debe aceptarla). */
export type DeliveryOptionsResponse = { pickup: { enabled: boolean; points: PickupPoint[] }; shipping: { enabled: boolean }; termsVersion: number };

/** POST /api/tienda/envio/cotizar (misma lógica que /api/preventa/[slug]/envio, pero por carrito). */
export type ShippingQuoteRequest = { lines: CartLine[]; postalCode: string; state: string; city: string; neighborhood: string };

export type ShippingRate = { id: string; label: string; carrier: string; service: string; days: number | null; price: Money };

export type ShippingQuoteResponse = { quoteId: string; expiresAt: string; rates: ShippingRate[] };

/** POST /api/tienda/checkout (cabecera Idempotency-Key). Crea el pedido pendiente y la sesión de pago. */
export type CheckoutRequest = {
  contact: { fullName: string; email: string; phone?: string };
  lines: CartLine[];
  couponCode?: string;
  delivery: { method: "pickup"; pickupPointId: string } | { method: "shipping"; quoteId: string; rateId: string; address: Address };
  acceptTerms: true;
  termsVersion: number;
  marketingConsent: boolean;
  /** Honeypot. */
  website?: string;
};

export type CheckoutResponse = { orderNumber: string; checkoutUrl: string; checkoutExpiresAt: string };

// ---------------------------------------------------------------------------------------------
// Pedidos y seguimiento

export type PaymentStatus = "pending" | "authorized" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export type FulfillmentStatus = "confirmed" | "preparing" | "label_generated" | "ready_for_pickup" | "handed_to_carrier" | "in_transit" | "out_for_delivery" | "delivered" | "exception";

export type OrderLine = { name: string; image: ProductImage; quantity: number; unitPrice: Money; subtotal: Money };

export type TrackingEvent = { at: string; status: FulfillmentStatus; description: string; location: string | null };

export type OrderView = {
  orderNumber: string;
  createdAt: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  lines: OrderLine[];
  subtotal: Money;
  discount: Money | null;
  shipping: Money;
  total: Money;
  delivery: { method: DeliveryMethod; pickupPoint: PickupPoint | null; address: Pick<Address, "name" | "city" | "state" | "postalCode"> & { line1: string } | null };
  /** Correo enmascarado. */
  email: string;
  shipment: { carrier: string; trackingNumber: string; trackingUrl: string | null; eta: string | null } | null;
  /** Solo eventos reales del proveedor logístico o del panel (nunca inventados). */
  events: TrackingEvent[];
};

/** GET /api/tienda/pedido/confirmacion?session_id=… (regreso del pago). */
export type OrderConfirmationResponse = OrderView;

/** POST /api/tienda/rastrear — folio + correo; respuesta idéntica si no coincide (anti-enumeración). */
export type TrackOrderRequest = { orderNumber: string; email: string };

// ---------------------------------------------------------------------------------------------
// Cuenta (opcional: comprar como invitado siempre es posible)

/** POST /api/tienda/cuenta/acceso — envía enlace mágico; respuesta igual exista o no la cuenta. */
export type AccountAccessRequest = { email: string };

export type AccountView = {
  firstName: string;
  email: string;
  orders: Pick<OrderView, "orderNumber" | "createdAt" | "paymentStatus" | "fulfillmentStatus" | "total">[];
  addresses: (Address & { id: string; isDefault: boolean })[];
  marketingConsent: boolean;
};

// ---------------------------------------------------------------------------------------------
// Contenido y formularios

export type Faq = { id: string; category: "compra" | "pagos" | "envios" | "cambios" | "grupos" | "producto"; question: string; answer: string };

/** POST /api/tienda/contacto (antispam + rate limit). */
export type ContactRequest = { fullName: string; email: string; phone?: string; topic: "pedido" | "producto" | "iglesias" | "facturacion" | "otro"; orderNumber?: string; message: string; website?: string };

/** POST /api/tienda/iglesias/cotizacion (brief §24). */
export type ChurchQuoteRequest = {
  organization: string;
  contactName: string;
  email: string;
  phone?: string;
  city: string;
  approximateQuantity: number;
  eventDate?: string;
  intendedUse: "grupos" | "retiro" | "consejeria" | "evento" | "otro";
  message: string;
  consent: true;
  website?: string;
};

/** POST /api/tienda/newsletter (doble opt-in; nunca suscribir por comprar). */
export type NewsletterRequest = { email: string; consent: true; source: string; website?: string };

export type AckResponse = { ok: true; reference?: string };

export type StoreErrorCode = "validation_error" | "not_found" | "out_of_stock" | "rate_limited" | "quote_expired" | "service_unavailable" | "terms_outdated";

export type StoreError = { error: { code: StoreErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
