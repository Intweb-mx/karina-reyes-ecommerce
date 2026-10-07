/*
 * Adaptador SIMULADO de la tienda. Solo para construir y revisar la UI mientras el backend implementa
 * docs/store/BACKEND-REQUEST.md. Todos los datos son de EJEMPLO y no deben tratarse como verdad de negocio:
 * - Precio: se usa el de la preventa aprobada ($500) como referencia; el precio de tienda está pendiente.
 * - Puntos de recolección: los aprobados en la campaña de preventa.
 * - Tarifas, pedidos y eventos de rastreo: inventados para la demo y marcados con "EJEMPLO".
 */
import type { Result, StoreApi } from "./api";
import type { CartQuoteLine, Money, OrderView, ProductDetail, ProductSummary } from "./contract";
import { faqs } from "@/content/store";
import { getProductContent } from "@/content/products";

const MXN = (amount: number): Money => ({ amount, currency: "mxn" });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const content = getProductContent("uno-mas-uno")!;

const unoMasUno: ProductDetail = {
  id: "prod_uno_mas_uno",
  slug: "uno-mas-uno",
  sku: null,
  name: "UNO+UNO",
  tagline: content.tagline,
  type: "physical",
  status: "available",
  price: MXN(50000),
  compareAtPrice: null,
  image: { ...content.thumbnail },
  territories: ["conversacion", "conexion", "intimidad", "conocimiento"],
  availableUnits: null,
  description: content.intro,
  gallery: [content.hero, content.includes!.image, content.bonus!.image, content.thumbnail].map((image) => ({ ...image })),
  includes: content.includes!.items,
  howToPlay: [
    { title: "Elijan una categoría", body: "Según el momento y lo que quieran cultivar." },
    { title: "Saquen una tarjeta", body: "Una pregunta a la vez, sin prisa." },
    { title: "Respondan y escuchen", body: "Lo importante pasa en la conversación." },
    { title: "Conecten más allá", body: "Lleven lo que descubran a su vida diaria." },
  ],
  faqs: faqs.filter((faq) => ["envios-mexico", "recoleccion", "devoluciones", "para-quien"].includes(faq.id)),
  maxQuantityPerOrder: 10,
  related: [],
  seo: { title: "UNO+UNO · Conversaciones que nos acercan", description: content.intro[1] ?? content.tagline },
};

const catalog: ProductSummary[] = [unoMasUno];

function quoteLines(lines: { productId: string; quantity: number }[]): CartQuoteLine[] {
  return lines.flatMap((line) => {
    const product = catalog.find((p) => p.id === line.productId);
    if (!product?.price) return [];
    const max = (product as ProductDetail).maxQuantityPerOrder ?? 10;
    const quantity = Math.min(Math.max(1, line.quantity), max);
    return [
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        unitPrice: product.price,
        quantity,
        subtotal: MXN(product.price.amount * quantity),
        notice: quantity < line.quantity ? `Máximo ${max} por pedido.` : null,
        available: product.status !== "sold_out",
        maxQuantity: max,
      },
    ];
  });
}

function demoOrder(orderNumber: string, method: "shipping" | "pickup" = "shipping"): OrderView {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
  const shipping = method === "shipping" ? MXN(18900) : MXN(0);
  return {
    orderNumber,
    createdAt: at(30),
    paymentStatus: "paid",
    fulfillmentStatus: method === "shipping" ? "in_transit" : "ready_for_pickup",
    lines: [{ name: "UNO+UNO", image: unoMasUno.image, quantity: 1, unitPrice: MXN(50000), subtotal: MXN(50000) }],
    subtotal: MXN(50000),
    discount: null,
    shipping,
    total: MXN(50000 + shipping.amount),
    delivery:
      method === "shipping"
        ? { method, pickupPoint: null, address: { name: "Cliente de EJEMPLO", line1: "Calle de ejemplo 123, Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000" } }
        : { method, pickupPoint: { id: "sophos-baluarte", name: "Librería Sophos · Iglesia Baluarte", schedule: "Domingos de 10:00 a.m. a 2:00 p.m." }, address: null },
    email: "c***@ejemplo.com",
    shipment: method === "shipping" ? { carrier: "Paquetería de EJEMPLO", trackingNumber: "EJEMPLO123456", trackingUrl: null, eta: at(-48) } : null,
    events:
      method === "shipping"
        ? [
            { at: at(30), status: "confirmed", description: "Pedido confirmado", location: null },
            { at: at(20), status: "preparing", description: "En preparación", location: "Chihuahua, Chih." },
            { at: at(8), status: "handed_to_carrier", description: "Entregado a paquetería", location: "Chihuahua, Chih." },
            { at: at(2), status: "in_transit", description: "En tránsito (EJEMPLO)", location: "Centro de distribución" },
          ]
        : [
            { at: at(30), status: "confirmed", description: "Pedido confirmado", location: null },
            { at: at(4), status: "ready_for_pickup", description: "Listo para recoger", location: "Librería Sophos · Iglesia Baluarte" },
          ],
  };
}

export const mockStoreApi: StoreApi = {
  mode: "mock",
  async catalog() {
    return ok({ products: catalog });
  },
  async product(slug) {
    return slug === unoMasUno.slug ? ok(unoMasUno) : { ok: false, error: { code: "not_found", message: "Producto no encontrado." } };
  },
  async quoteCart({ lines, couponCode }) {
    await wait(200);
    const quoted = quoteLines(lines);
    const subtotal = quoted.reduce((sum, line) => sum + line.subtotal.amount, 0);
    const couponError = couponCode ? "Los cupones estarán disponibles pronto." : null;
    return ok({ lines: quoted, subtotal: MXN(subtotal), discount: null, coupon: null, couponError, total: MXN(subtotal) });
  },
  async deliveryOptions() {
    return ok({
      pickup: {
        enabled: true,
        points: [
          { id: "sophos-baluarte", name: "Librería Sophos · Iglesia Baluarte", schedule: "Domingos de 10:00 a.m. a 2:00 p.m." },
          { id: "costco", name: "Costco Chihuahua", schedule: "Entrega previa confirmación de día y horario." },
        ],
      },
      shipping: { enabled: true },
      termsVersion: 1,
    });
  },
  async quoteShipping({ postalCode }) {
    await wait(700);
    if (!/^\d{5}$/.test(postalCode)) return { ok: false, error: { code: "validation_error", message: "Revisa el código postal.", fieldErrors: { postalCode: ["Código postal de 5 dígitos."] } } };
    return ok({
      quoteId: "quote_demo",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      rates: [
        { id: "economico", label: "Envío económico", carrier: "Paquetería de EJEMPLO", service: "Terrestre", days: 5, price: MXN(18900) },
        { id: "express", label: "Envío express", carrier: "Paquetería de EJEMPLO", service: "Día siguiente", days: 2, price: MXN(32900) },
      ],
    });
  },
  async checkout() {
    await wait(900);
    // Sin pasarela en modo simulado: se va directo a la confirmación de ejemplo.
    return ok({ orderNumber: "INT-EJEMPLO-0001", checkoutUrl: "/pedido/confirmado?session_id=demo", checkoutExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  },
  async orderConfirmation() {
    await wait(400);
    return ok({ ...demoOrder("INT-EJEMPLO-0001"), fulfillmentStatus: "confirmed", shipment: null, events: demoOrder("x").events.slice(0, 1) });
  },
  async trackOrder({ orderNumber, email }) {
    await wait(600);
    // Anti-enumeración: el backend real responde igual si no coincide folio + correo.
    if (!orderNumber.trim() || !email.includes("@")) return { ok: false, error: { code: "not_found", message: "No encontramos un pedido con esos datos. Revisa el número de pedido y el correo." } };
    return ok(demoOrder(orderNumber.trim().toUpperCase(), /recog|pick/i.test(orderNumber) ? "pickup" : "shipping"));
  },
  async requestAccountAccess() {
    await wait(500);
    return ok({ ok: true });
  },
  async account() {
    const order = demoOrder("INT-EJEMPLO-0001");
    return ok({
      firstName: "Cliente",
      email: "cliente@ejemplo.com",
      orders: [
        { orderNumber: order.orderNumber, createdAt: order.createdAt, paymentStatus: "paid", fulfillmentStatus: "in_transit", total: order.total },
        { orderNumber: "INT-EJEMPLO-0000", createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), paymentStatus: "paid", fulfillmentStatus: "delivered", total: MXN(50000) },
      ],
      addresses: [{ id: "addr_1", name: "Cliente de EJEMPLO", phone: "6140000000", street: "Calle de ejemplo 123", neighborhood: "Centro", postalCode: "31000", city: "Chihuahua", state: "Chihuahua", isDefault: true }],
      marketingConsent: false,
    });
  },
  async contact() {
    await wait(600);
    return ok({ ok: true, reference: "EJEMPLO-CONTACTO" });
  },
  async churchQuote() {
    await wait(700);
    return ok({ ok: true, reference: "EJEMPLO-COTIZACION" });
  },
  async newsletter() {
    await wait(500);
    return ok({ ok: true });
  },
};
