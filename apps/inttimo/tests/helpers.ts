import { getCurrentTerms, publishTerms, upsertCampaign, type Database, type QuestionDefinition } from "@inttimo/database";
import type Stripe from "stripe";
import type { CheckoutSnapshot, CreateCheckoutInput, CreateStoreCheckoutInput, PaymentGateway } from "../src/server/presale/gateway.ts";
import type { Rate, Shipment, ShippingProvider } from "../src/server/shipping/provider.ts";

export const QUESTIONS: QuestionDefinition[] = [
  { id: "como_nos_conociste", label: "¿Cómo nos conociste?", type: "select", required: true, options: [{ value: "redes", label: "Redes" }, { value: "amigos", label: "Amigos" }] },
  { id: "comentarios", label: "Comentarios", type: "textarea", required: false },
  { id: "acepta_contacto", label: "¿Podemos contactarte?", type: "boolean", required: true },
];

export const VALID_ANSWERS = { como_nos_conociste: "redes", acepta_contacto: true };

export const NOW = new Date("2026-10-05T12:00:00Z");

export const PICKUP_POINTS = [
  { id: "sophos-baluarte", name: "Librería Sophos · Iglesia Baluarte", schedule: "Domingos de 10:00 a.m. a 2:00 p.m." },
  { id: "costco", name: "Costco Chihuahua", schedule: "Entrega previa confirmación de día y horario." },
];

/** Datos de prueba (no son los reales de inttimo). */
export const SHIPPING_PROFILE = {
  origin: { name: "Origen Prueba", company: null, street: "Calle 1", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", phone: "6140000000", email: "origen@prueba.test", reference: null },
  parcel: { weightKg: 0.8, lengthCm: 20, widthCm: 15, heightCm: 8 },
  carriers: [],
  consignmentNote: "00000000",
  packageType: "4G",
};

export const PICKUP = { deliveryMethod: "pickup", pickupPointId: "costco" };

export const ADDRESS = { street: "Av. Reforma 100", neighborhood: "Juárez", city: "Cuauhtémoc", state: "Ciudad de México", postalCode: "06600", reference: "Portón negro" };

/** SkyDropX simulado: dos tarifas (económica y express) y guías inmediatas. */
export class FakeShipping implements ShippingProvider {
  quotes: Parameters<ShippingProvider["quote"]>[0][] = [];
  shipments: Parameters<ShippingProvider["createShipment"]>[0][] = [];
  fail = false;
  rates: Rate[] = [
    { rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, amount: 18_000, currency: "mxn" },
    { rateId: "rate_exp", carrier: "DHL", service: "Express", days: 1, amount: 32_050, currency: "mxn" },
  ];
  tracking: string | null = "GUIA123";

  async quote(input: Parameters<ShippingProvider["quote"]>[0]) {
    if (this.fail) throw new Error("skydropx caído");
    this.quotes.push(input);
    return { quotationId: `quo_${this.quotes.length}`, rates: this.rates };
  }

  async createShipment(input: Parameters<ShippingProvider["createShipment"]>[0]): Promise<Shipment> {
    if (this.fail) throw new Error("skydropx caído");
    this.shipments.push(input);
    return { shipmentId: `shp_${this.shipments.length}`, trackingNumber: this.tracking, labelUrl: "https://etiquetas.test/1.pdf", carrier: "Estafeta" };
  }

  async getShipment(shipmentId: string): Promise<Shipment> {
    return { shipmentId, trackingNumber: "GUIA123", labelUrl: "https://etiquetas.test/1.pdf", carrier: "Estafeta" };
  }
}

export async function seedCampaign(db: Database, overrides: Partial<Parameters<typeof upsertCampaign>[1]> = {}) {
  const campaign = await upsertCampaign(db, {
    slug: "uno-mas-uno",
    productName: "UNO+UNO",
    status: "active",
    startsAt: new Date("2026-10-01T00:00:00Z"),
    endsAt: new Date("2026-10-15T00:00:00Z"),
    unitAmount: 99_900,
    currency: "mxn",
    maxQuantityPerReservation: 3,
    questions: QUESTIONS,
    pickupPoints: PICKUP_POINTS,
    shippingProfile: SHIPPING_PROFILE,
    ...overrides,
  });
  if (!(await getCurrentTerms(db, campaign.id))) await publishTerms(db, campaign.id, "Términos de prueba v1", "test");
  return campaign;
}

export class FakeGateway implements PaymentGateway {
  created: CreateCheckoutInput[] = [];
  storeCreated: CreateStoreCheckoutInput[] = [];
  expired: string[] = [];
  fail = false;
  snapshots = new Map<string, Partial<CheckoutSnapshot>>();

  async createCheckout(input: CreateCheckoutInput) {
    if (this.fail) throw new Error("stripe down");
    this.created.push(input);
    const id = `cs_test_${String(this.created.length).padStart(12, "0")}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
  }

  async createStoreCheckout(input: CreateStoreCheckoutInput) {
    if (this.fail) throw new Error("stripe down");
    this.storeCreated.push(input);
    const id = `cs_test_store_${String(this.storeCreated.length).padStart(12, "0")}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
  }

  async expireCheckout(sessionId: string) {
    this.expired.push(sessionId);
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutSnapshot> {
    const base = { id: sessionId, status: "open" as const, paymentStatus: "unpaid" as const, paymentIntentId: null, shippingAddress: null };
    if (sessionId.startsWith("cs_test_store_")) {
      const input = this.storeCreated[Number(sessionId.slice("cs_test_store_".length)) - 1];
      return {
        ...base,
        kind: "store",
        reservationId: null,
        storeOrderId: input?.orderId ?? null,
        amountTotal: input ? input.lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0) + input.shippingAmount : null,
        currency: input?.currency ?? null,
        ...this.snapshots.get(sessionId),
      };
    }
    const input = this.created.find((_, index) => `cs_test_${String(index + 1).padStart(12, "0")}` === sessionId);
    return {
      ...base,
      kind: "presale",
      reservationId: input?.reservationId ?? null,
      storeOrderId: null,
      amountTotal: input ? input.unitAmount * input.quantity : null,
      currency: input?.currency ?? null,
      ...this.snapshots.get(sessionId),
    };
  }
}

export function sessionEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" | "checkout.session.async_payment_failed" | "checkout.session.expired",
  session: Partial<Stripe.Checkout.Session> & { id: string },
  eventId = `evt_${Math.random().toString(36).slice(2)}`,
): Stripe.Event {
  return { id: eventId, object: "event", type, data: { object: { object: "checkout.session", ...session } } } as unknown as Stripe.Event;
}

export function refundEvent(paymentIntent: string, amountRefunded: number, eventId = `evt_${Math.random().toString(36).slice(2)}`): Stripe.Event {
  return {
    id: eventId,
    object: "event",
    type: "charge.refunded",
    data: { object: { object: "charge", id: "ch_1", payment_intent: paymentIntent, amount_refunded: amountRefunded } },
  } as unknown as Stripe.Event;
}
