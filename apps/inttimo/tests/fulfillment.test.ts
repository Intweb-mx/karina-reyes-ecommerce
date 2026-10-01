import { findReservationById, listReservationEvents, markPaid, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBonusAccess } from "../src/server/presale/bonus.ts";
import { fulfillReservation, sendBonusIfEligible, type FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { createStripeGateway } from "../src/server/presale/gateway.ts";
import { createPresaleReservation, type PresaleDeps } from "../src/server/presale/reservations.ts";
import { FakeGateway, NOW, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let failMail: boolean;
let deps: FulfillmentDeps;
let presale: PresaleDeps;
let campaignId: string;

const BONUS = { title: "Guía y video de preventa", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video", linkDays: 30 };

async function paidReservation(deliveryMethod: "shipping" | "pickup", paidAt = NOW) {
  const result = await createPresaleReservation(presale, {
    slug: "uno-mas-uno",
    body: { fullName: "Ana Pérez", email: "ana@ejemplo.com", answers: VALID_ANSWERS, acceptTerms: true, termsVersion: 1, deliveryMethod },
    idempotencyKey: null,
    clientIp: `10.0.0.${Math.floor(Math.random() * 250)}`,
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
  presale = { db, gateway: new FakeGateway(), siteUrl: "https://inttimo.test", now: () => NOW };
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

  it("recolección: no pide dirección ni cobra envío", async () => {
    const { gateway, calls } = captureGateway();
    await gateway.createCheckout({ ...base, deliveryMethod: "pickup", shippingAmount: 0 });
    expect(calls[0]!.shipping_address_collection).toBeUndefined();
    expect(calls[0]!.shipping_options).toBeUndefined();
  });

  it("envío con costo: pide dirección en México y cobra el envío fijo", async () => {
    const { gateway, calls } = captureGateway();
    await gateway.createCheckout({ ...base, deliveryMethod: "shipping", shippingAmount: 15_000 });
    expect(calls[0]!.shipping_address_collection).toEqual({ allowed_countries: ["MX"] });
    expect(calls[0]!.shipping_options?.[0]?.shipping_rate_data).toMatchObject({ type: "fixed_amount", fixed_amount: { amount: 15_000, currency: "mxn" } });
  });

  it("envío por cotizar: pide dirección sin cobrar envío", async () => {
    const { gateway, calls } = captureGateway();
    await gateway.createCheckout({ ...base, deliveryMethod: "shipping", shippingAmount: 0 });
    expect(calls[0]!.shipping_address_collection).toBeDefined();
    expect(calls[0]!.shipping_options).toBeUndefined();
  });
});
