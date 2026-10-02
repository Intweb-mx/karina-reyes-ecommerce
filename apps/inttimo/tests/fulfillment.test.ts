import { findReservationById, listReservationEvents, markPaid, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBonusAccess } from "../src/server/presale/bonus.ts";
import { fulfillReservation, sendBonusIfEligible, type FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { createStripeGateway } from "../src/server/presale/gateway.ts";
import { createPresaleReservation, type PresaleDeps } from "../src/server/presale/reservations.ts";
import { generateLabel, quoteShipping } from "../src/server/presale/shipping.ts";
import { ADDRESS, FakeGateway, FakeShipping, NOW, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let failMail: boolean;
let deps: FulfillmentDeps;
let presale: PresaleDeps;
let campaignId: string;
let shipping: FakeShipping;

const BONUS = { title: "Guía y video de preventa", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video", linkDays: 30 };

async function paidReservation(deliveryMethod: "shipping" | "pickup", paidAt = NOW) {
  const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
  let delivery: Record<string, unknown> = { deliveryMethod, pickupPointId: "costco" };
  if (deliveryMethod === "shipping") {
    const quoted = await quoteShipping({ db, provider: shipping, now: () => NOW }, { slug: "uno-mas-uno", body: { ...ADDRESS, quantity: 1 }, clientIp: ip });
    if (!quoted.ok) throw new Error(JSON.stringify(quoted.body));
    delivery = { deliveryMethod, phone: "6141234567", shipping: { quoteId: quoted.data.quoteId, optionId: "economico", address: ADDRESS } };
  }
  const result = await createPresaleReservation(presale, {
    slug: "uno-mas-uno",
    body: { fullName: "Ana Pérez", email: "ana@ejemplo.com", answers: VALID_ANSWERS, acceptTerms: true, termsVersion: 1, ...delivery },
    idempotencyKey: null,
    clientIp: ip,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  const gateway = presale.gateway as FakeGateway;
  const id = gateway.created.at(-1)!.reservationId;
  await markPaid(db, id, {}, { source: "stripe" });
  await db.execute(`update presale_reservations set paid_at = '${paidAt.toISOString()}' where id = '${id}'`);
  return id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  failMail = false;
  const send = async (mail: Mail) => {
    if (failMail) throw new Error("resend caído");
    sent.push(mail);
  };
  deps = { db, send, siteUrl: "https://inttimo.test/", now: () => NOW };
  shipping = new FakeShipping();
  presale = { db, gateway: new FakeGateway(), shipping, siteUrl: "https://inttimo.test", now: () => NOW };
  campaignId = (await seedCampaign(db, { bonus: BONUS })).id;
});

afterEach(() => close());

const tokenFrom = (mail: Mail) => mail.text.match(/\/bonus\/([\w-]{43})/)![1]!;

describe("entrega de pedidos", () => {
  it("recolección: listo para recoger avisa con la nota y libera el bonus una sola vez", async () => {
    const id = await paidReservation("pickup");
    const result = await fulfillReservation(deps, id, { type: "ready_for_pickup", note: "Costco Juventud, sábado 10:00–13:00" }, "admin@inttimo.test");
    expect(result).toMatchObject({ ok: true, email: "sent", bonus: "sent" });
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining("listo para recoger"), expect.stringContaining("bonus")]);
    expect(sent[0]!.text).toContain("Costco Juventud");
    expect(sent[0]!.text).toContain("Punto de recolección: Costco Chihuahua");
    expect(await sendBonusIfEligible(deps, id)).toBe("skipped");

    const access = await resolveBonusAccess(db, tokenFrom(sent[1]!), NOW);
    expect(access).toMatchObject({ status: "ok", bonus: BONUS });
    expect(await resolveBonusAccess(db, tokenFrom(sent[1]!), new Date(NOW.getTime() + 31 * 86_400_000))).toMatchObject({ status: "expired" });
    expect(await resolveBonusAccess(db, "x".repeat(43), NOW)).toEqual({ status: "invalid" });
  });

  it("envío: guarda paquetería y guía y las manda al cliente", async () => {
    const id = await paidReservation("shipping");
    const shipment = { carrier: "Estafeta", trackingNumber: "ABC123", trackingUrl: "https://rastreo.test/ABC123" };
    expect(await fulfillReservation(deps, id, { type: "ready_for_pickup" }, "admin")).toEqual({ ok: false, error: "Este pedido es con envío a domicilio." });
    expect((await fulfillReservation(deps, id, { type: "shipped", shipment }, "admin")).ok).toBe(true);
    expect(sent[0]!.text).toContain("ABC123");
    expect(await findReservationById(db, id)).toMatchObject({ fulfillmentStatus: "shipped", ...shipment });
    expect((await fulfillReservation(deps, id, { type: "delivered" }, "admin")).ok).toBe(true);
  });

  it("compras pagadas después del cierre no reciben bonus; sin bonus configurado tampoco", async () => {
    const late = await paidReservation("pickup", new Date("2026-10-20T12:00:00Z"));
    expect(await fulfillReservation(deps, late, { type: "ready_for_pickup" }, "admin")).toMatchObject({ ok: true, bonus: "not_eligible" });

    await updateCampaign(db, campaignId, { bonus: null });
    const other = await paidReservation("pickup");
    expect(await fulfillReservation(deps, other, { type: "ready_for_pickup" }, "admin")).toMatchObject({ ok: true, bonus: "not_configured" });
  });

  it("si el correo falla, el estado se conserva y el bonus se puede reintentar", async () => {
    const id = await paidReservation("pickup");
    failMail = true;
    expect(await fulfillReservation(deps, id, { type: "ready_for_pickup" }, "admin")).toMatchObject({ ok: true, email: "failed", bonus: "failed" });
    expect((await findReservationById(db, id))?.bonusSentAt).toBeNull();
    const types = (await listReservationEvents(db, id)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["READY_FOR_PICKUP", "FULFILLMENT_EMAIL_FAILED", "BONUS_FAILED"]));
    failMail = false;
    expect(await sendBonusIfEligible(deps, id)).toBe("sent");
  });

  it("un pedido reembolsado no da acceso al bonus", async () => {
    const id = await paidReservation("pickup");
    await fulfillReservation(deps, id, { type: "ready_for_pickup" }, "admin");
    await db.execute(`update presale_reservations set status = 'refunded', amount_refunded = total_amount where id = '${id}'`);
    expect(await resolveBonusAccess(db, tokenFrom(sent[1]!), NOW)).toEqual({ status: "invalid" });
  });
});

describe("guía de SkyDropX", () => {
  const labelDeps = () => ({ db, provider: shipping, now: () => NOW, fulfillment: deps });

  it("compra la guía con la tarifa pagada, marca ENVIADO y avisa con el número de guía", async () => {
    const id = await paidReservation("shipping");
    const result = await generateLabel(labelDeps(), id, "admin@inttimo.test");
    expect(result).toMatchObject({ ok: true, status: "shipped" });
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_1", rateId: "rate_eco", to: { postalCode: ADDRESS.postalCode, phone: "6141234567", email: "ana@ejemplo.com" } });
    expect(await findReservationById(db, id)).toMatchObject({ fulfillmentStatus: "shipped", trackingNumber: "GUIA123", shipmentId: "shp_1", labelUrl: "https://etiquetas.test/1.pdf" });
    expect(sent[0]!.text).toContain("GUIA123");
    expect(await generateLabel(labelDeps(), id, "admin")).toEqual({ ok: false, error: "El pedido ya fue enviado." });
  });

  it("si la guía aún no tiene número, la deja pendiente y la completa al reintentar sin comprar otra", async () => {
    const id = await paidReservation("shipping");
    shipping.tracking = null;
    expect(await generateLabel(labelDeps(), id, "admin")).toMatchObject({ ok: true, status: "pending" });
    expect(await generateLabel(labelDeps(), id, "admin")).toMatchObject({ ok: true, status: "shipped" });
    expect(shipping.shipments).toHaveLength(1);
  });

  it("con la cotización vencida (más de 23 h) vuelve a cotizar y conserva la misma paquetería", async () => {
    const id = await paidReservation("shipping");
    const later = { ...labelDeps(), now: () => new Date(NOW.getTime() + 30 * 3_600_000) };
    expect((await generateLabel(later, id, "admin")).ok).toBe(true);
    expect(shipping.quotes).toHaveLength(2);
    expect(shipping.shipments[0]).toMatchObject({ quotationId: "quo_2", rateId: "rate_eco" });
  });

  it("no genera guía para recolección ni para pedidos sin pagar; si SkyDropX falla queda en el historial", async () => {
    const pickup = await paidReservation("pickup");
    expect(await generateLabel(labelDeps(), pickup, "admin")).toEqual({ ok: false, error: "Este pedido es con recolección." });
    const id = await paidReservation("shipping");
    shipping.fail = true;
    expect((await generateLabel(labelDeps(), id, "admin")).ok).toBe(false);
    expect((await listReservationEvents(db, id)).map((e) => e.type)).toContain("LABEL_FAILED");
  });
});

describe("Stripe Checkout según el método de entrega", () => {
  function captureGateway() {
    const calls: Stripe.Checkout.SessionCreateParams[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams) => {
            calls.push(params);
            return { id: "cs_x", url: "https://checkout.stripe.test/x", expires_at: 2_000_000_000 };
          },
        },
      },
    } as unknown as Stripe;
    return { gateway: createStripeGateway(stripe), calls };
  }
  const base = { reservationId: "r", reservationCode: "PV-X", campaignSlug: "uno-mas-uno", productName: "UNO+UNO", unitAmount: 50_000, currency: "mxn", quantity: 1, email: "a@b.c", successUrl: "s", cancelUrl: "c", expiresAt: new Date(2_000_000_000_000) };

  it("recolección: sin dirección ni cargo de envío", async () => {
    const { gateway, calls } = captureGateway();
    await gateway.createCheckout({ ...base, deliveryMethod: "pickup", shippingAmount: 0 });
    expect(calls[0]!.shipping_address_collection).toBeUndefined();
    expect(calls[0]!.shipping_options).toBeUndefined();
  });

  it("envío: Stripe cobra la tarifa cotizada; la dirección ya se capturó en el checkout", async () => {
    const { gateway, calls } = captureGateway();
    await gateway.createCheckout({ ...base, deliveryMethod: "shipping", shippingAmount: 18_000, shippingLabel: "Envío · Estafeta Terrestre" });
    expect(calls[0]!.shipping_address_collection).toBeUndefined();
    expect(calls[0]!.shipping_options?.[0]?.shipping_rate_data).toMatchObject({ type: "fixed_amount", display_name: "Envío · Estafeta Terrestre", fixed_amount: { amount: 18_000, currency: "mxn" } });
  });
});
