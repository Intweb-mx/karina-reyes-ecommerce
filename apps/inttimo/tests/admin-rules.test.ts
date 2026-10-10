import { describe, expect, it } from "vitest";
import { incidentsFor } from "../src/server/admin/incidents.ts";
import { nextStepFor } from "../src/server/admin/next-step.ts";
import { NOW } from "./helpers.ts";

type Order = Parameters<typeof incidentsFor>[0] & Parameters<typeof nextStepFor>[0];

const ADDRESS = { name: "Ana", phone: "6141234567", street: "Calle 1", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", reference: null };

const base: Order = {
  status: "paid",
  email: "ana@ejemplo.com",
  paymentMethod: "stripe",
  deliveryMethod: "shipping",
  fulfillmentStatus: "pending",
  trackingNumber: null,
  shipmentId: null,
  deliveryAddress: ADDRESS,
  shippingAddress: null,
  paidAt: NOW,
  confirmationEmailSentAt: NOW,
  bonusSentAt: null,
  stripeCheckoutSessionId: "cs_1",
  createdAt: NOW,
};
const order = (overrides: Partial<Order> = {}): Order => ({ ...base, ...overrides });
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const ev = (type: string, minutes: number) => ({ type, createdAt: at(minutes) });

describe("venta registrada a mano", () => {
  it("pendiente en persona: el siguiente paso es marcar entregado, sin avisar que está listo", () => {
    expect(nextStepFor(order({ paymentMethod: "cash", deliveryMethod: "pickup", deliveryAddress: null }))).toEqual({ type: "mark_picked_up" });
  });

  it("sin correo no cuenta como confirmación fallida", () => {
    expect(incidentsFor(order({ email: "", confirmationEmailSentAt: null, paymentMethod: "cash" }), [], at(60))).toEqual([]);
    expect(incidentsFor(order({ confirmationEmailSentAt: null }), [], at(60))).toContain("confirmation_email_failed");
  });
});

describe("siguiente paso", () => {
  it.each([
    ["sin pagar", order({ status: "pending_payment" }), { type: "not_paid" }],
    ["reembolsado", order({ status: "refunded" }), { type: "not_paid" }],
    ["envío sin guía", order(), { type: "generate_label", blocked: null, inProgress: false }],
    ["guía en proceso", order({ shipmentId: "shp_1" }), { type: "generate_label", blocked: null, inProgress: true }],
    ["sin dirección", order({ deliveryAddress: null }), { type: "generate_label", blocked: "missing_address", inProgress: false }],
    ["guía lista", order({ trackingNumber: "G1", shipmentId: "shp_1" }), { type: "hand_to_carrier" }],
    ["enviado", order({ fulfillmentStatus: "shipped", trackingNumber: "G1" }), { type: "mark_delivered" }],
    ["enviado con reembolso parcial", order({ status: "partially_refunded", fulfillmentStatus: "shipped" }), { type: "mark_delivered" }],
    ["recolección por preparar", order({ deliveryMethod: "pickup", deliveryAddress: null }), { type: "notify_ready" }],
    ["recolección avisada", order({ deliveryMethod: "pickup", fulfillmentStatus: "ready_for_pickup" }), { type: "mark_picked_up" }],
    ["entregado", order({ fulfillmentStatus: "delivered" }), { type: "none" }],
  ])("%s", (_name, input, expected) => {
    expect(nextStepFor(input)).toEqual(expected);
  });
});

describe("incidencias", () => {
  it("un pedido sin problemas no tiene incidencias", () => {
    expect(incidentsFor(order(), [], at(60))).toEqual([]);
  });

  it("guía fallida hasta que se genera una nueva o el pedido avanza", () => {
    expect(incidentsFor(order(), [ev("LABEL_FAILED", 1)], at(60))).toEqual(["label_failed"]);
    expect(incidentsFor(order(), [ev("LABEL_FAILED", 1), ev("LABEL_CREATED", 2)], at(60))).toEqual([]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("LABEL_FAILED", 1)], at(60))).toEqual([]);
  });

  it("guía fallida pero con número de guía guardado no es incidencia", () => {
    expect(incidentsFor(order({ trackingNumber: "G1" }), [ev("LABEL_FAILED", 1)], at(60))).toEqual([]);
  });

  it("dirección faltante solo si no hay ni dirección de entrega ni la de Stripe", () => {
    const stripeAddress = { line1: "Calle 1" } as unknown as Order["shippingAddress"];
    expect(incidentsFor(order({ deliveryAddress: null, shippingAddress: stripeAddress }), [], at(60))).toEqual([]);
    expect(incidentsFor(order({ deliveryAddress: null, shippingAddress: null }), [], at(60))).toEqual(["missing_address"]);
  });

  it("confirmación sin enviar después de 15 minutos del pago", () => {
    expect(incidentsFor(order({ confirmationEmailSentAt: null }), [], at(5))).toEqual([]);
    expect(incidentsFor(order({ confirmationEmailSentAt: null }), [], at(20))).toEqual(["confirmation_email_failed"]);
  });

  it("aviso de entrega fallido hasta que uno posterior sale bien", () => {
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("FULFILLMENT_EMAIL_FAILED", 1)], at(60))).toEqual(["fulfillment_email_failed"]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("FULFILLMENT_EMAIL_FAILED", 1), ev("FULFILLMENT_EMAIL_SENT", 2)], at(60))).toEqual([]);
  });

  it("bonus fallido mientras no se haya enviado", () => {
    expect(incidentsFor(order({ fulfillmentStatus: "shipped" }), [ev("BONUS_FAILED", 1)], at(60))).toEqual(["bonus_failed"]);
    expect(incidentsFor(order({ fulfillmentStatus: "shipped", bonusSentAt: at(3) }), [ev("BONUS_FAILED", 1)], at(60))).toEqual([]);
  });

  it("envío pagado sin dirección", () => {
    expect(incidentsFor(order({ deliveryAddress: null }), [], at(60))).toEqual(["missing_address"]);
    expect(incidentsFor(order({ deliveryMethod: "pickup", deliveryAddress: null }), [], at(60))).toEqual([]);
  });

  it("pago sin resolver por más de un día con sesión de Stripe", () => {
    const unpaid = order({ status: "pending_payment", paidAt: null, confirmationEmailSentAt: null });
    expect(incidentsFor(unpaid, [], at(25 * 60))).toEqual(["payment_unsettled"]);
    expect(incidentsFor(unpaid, [], at(2 * 60))).toEqual([]);
    expect(incidentsFor({ ...unpaid, stripeCheckoutSessionId: null }, [], at(25 * 60))).toEqual([]);
  });
});
