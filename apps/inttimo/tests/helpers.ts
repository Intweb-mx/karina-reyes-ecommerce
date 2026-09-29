import { getCurrentTerms, publishTerms, upsertCampaign, type Database, type QuestionDefinition } from "@inttimo/database";
import type Stripe from "stripe";
import type { CheckoutSnapshot, CreateCheckoutInput, PaymentGateway } from "../src/server/presale/gateway.ts";

export const QUESTIONS: QuestionDefinition[] = [
  { id: "como_nos_conociste", label: "¿Cómo nos conociste?", type: "select", required: true, options: [{ value: "redes", label: "Redes" }, { value: "amigos", label: "Amigos" }] },
  { id: "comentarios", label: "Comentarios", type: "textarea", required: false },
  { id: "acepta_contacto", label: "¿Podemos contactarte?", type: "boolean", required: true },
];

export const VALID_ANSWERS = { como_nos_conociste: "redes", acepta_contacto: true };

export const NOW = new Date("2026-10-05T12:00:00Z");

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
    ...overrides,
  });
  if (!(await getCurrentTerms(db, campaign.id))) await publishTerms(db, campaign.id, "Términos de prueba v1", "test");
  return campaign;
}

export class FakeGateway implements PaymentGateway {
  created: CreateCheckoutInput[] = [];
  fail = false;
  snapshots = new Map<string, Partial<CheckoutSnapshot>>();

  async createCheckout(input: CreateCheckoutInput) {
    if (this.fail) throw new Error("stripe down");
    this.created.push(input);
    const id = `cs_test_${String(this.created.length).padStart(12, "0")}`;
    return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: input.expiresAt };
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutSnapshot> {
    const input = this.created.find((_, index) => `cs_test_${String(index + 1).padStart(12, "0")}` === sessionId);
    return {
      id: sessionId,
      status: "open",
      paymentStatus: "unpaid",
      reservationId: input?.reservationId ?? null,
      paymentIntentId: null,
      amountTotal: input ? input.unitAmount * input.quantity : null,
      currency: input?.currency ?? null,
      shippingAddress: null,
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
