import { findReservationById, listReservationEvents, type Database, type PresaleReservation } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendConfirmationIfNeeded } from "../src/server/presale/notifications.ts";
import { createPresaleReservation } from "../src/server/presale/reservations.ts";
import { handleStripeEvent } from "../src/server/presale/webhook.ts";
import { FakeGateway, NOW, refundEvent, seedCampaign, sessionEvent, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let reservation: PresaleReservation;
const SESSION = "cs_test_000000000001";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  await seedCampaign(db, { deliveryNote: "Nota de entrega aprobada." });
  const deps = { db, gateway: new FakeGateway(), siteUrl: "https://inttimo.test", now: () => NOW };
  await createPresaleReservation(deps, {
    slug: "uno-mas-uno",
    body: { fullName: "Ana Pérez", email: "ana@ejemplo.com", answers: VALID_ANSWERS, acceptTerms: true, termsVersion: 1 },
    idempotencyKey: null,
    clientIp: null,
  });
  reservation = (await db.query.presaleReservations.findFirst())!;
});

afterEach(() => close());

const paidSession = { id: SESSION, status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 99_900, currency: "mxn" } as const;
const reload = async () => (await findReservationById(db, reservation.id))!;

describe("webhook de Stripe", () => {
  it("pago con tarjeta: completed → paid con dirección de envío", async () => {
    const outcome = await handleStripeEvent(
      db,
      sessionEvent("checkout.session.completed", {
        ...paidSession,
        collected_information: {
          business_name: null,
          individual_name: null,
          shipping_details: { name: "Ana Pérez", address: { line1: "Calle 1", line2: null, city: "CDMX", state: "CDMX", postal_code: "01000", country: "MX" } },
        },
      }),
    );
    expect(outcome).toMatchObject({ result: "applied", status: "paid" });
    const row = await reload();
    expect(row).toMatchObject({ status: "paid", stripePaymentIntentId: "pi_1" });
    expect(row.shippingAddress).toMatchObject({ postalCode: "01000", country: "MX" });
  });

  it("el mismo evento dos veces solo se aplica una vez", async () => {
    const event = sessionEvent("checkout.session.completed", paidSession, "evt_same");
    await handleStripeEvent(db, event);
    expect(await handleStripeEvent(db, event)).toEqual({ result: "duplicate" });
    const events = await listReservationEvents(db, reservation.id);
    expect(events.filter((e) => e.type === "PAYMENT_APPROVED")).toHaveLength(1);
  });

  it("OXXO: completed sin pago → processing → async_payment_succeeded → paid", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", { ...paidSession, payment_status: "unpaid" }));
    expect((await reload()).status).toBe("processing");
    await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_succeeded", paidSession));
    expect((await reload()).status).toBe("paid");
  });

  it("OXXO no pagado → payment_failed", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", { ...paidSession, payment_status: "unpaid" }));
    await handleStripeEvent(db, sessionEvent("checkout.session.async_payment_failed", { ...paidSession, payment_status: "unpaid" }));
    expect((await reload()).status).toBe("payment_failed");
  });

  it("expiración no pisa un pago que llegó antes", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", paidSession));
    const outcome = await handleStripeEvent(db, sessionEvent("checkout.session.expired", { id: SESSION, status: "expired", payment_status: "unpaid" }));
    expect(outcome).toMatchObject({ result: "unchanged", status: "paid" });
  });

  it("sesión sin pago que expira → expired", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.expired", { id: SESSION, status: "expired", payment_status: "unpaid" }));
    expect((await reload()).status).toBe("expired");
  });

  it("reembolsos parcial y total", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", paidSession));
    await handleStripeEvent(db, refundEvent("pi_1", 10_000));
    expect(await reload()).toMatchObject({ status: "partially_refunded", amountRefunded: 10_000 });
    await handleStripeEvent(db, refundEvent("pi_1", 99_900));
    expect(await reload()).toMatchObject({ status: "refunded", amountRefunded: 99_900 });
  });

  it("ignora sesiones ajenas a la preventa y eventos no manejados", async () => {
    expect(await handleStripeEvent(db, sessionEvent("checkout.session.completed", { ...paidSession, id: "cs_otra" }))).toEqual({ result: "ignored" });
    const other = { id: "evt_x", type: "customer.created", data: { object: {} } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(db, other)).toEqual({ result: "ignored" });
  });
});

describe("correo de confirmación", () => {
  it("se envía una sola vez y se reintenta si falla", async () => {
    await handleStripeEvent(db, sessionEvent("checkout.session.completed", paidSession));
    const sent: Mail[] = [];

    const failing = async () => {
      throw new Error("smtp down");
    };
    expect(await sendConfirmationIfNeeded(db, reservation.id, { send: failing })).toBe("failed");

    const ok = async (mail: Mail) => void sent.push(mail);
    expect(await sendConfirmationIfNeeded(db, reservation.id, { send: ok, notifyEmail: "equipo@inttimo.test" })).toBe("sent");
    expect(await sendConfirmationIfNeeded(db, reservation.id, { send: ok })).toBe("skipped");

    expect(sent.map((m) => m.to)).toEqual(["ana@ejemplo.com", "equipo@inttimo.test"]);
    expect(sent[0]!.text).toContain(reservation.code);
    expect(sent[0]!.text).toContain("Nota de entrega aprobada.");
    expect(sent[0]!.text).toMatch(/\$999\.00/);
  });
});

describe("firma del webhook (SDK real, sin red)", () => {
  it("acepta la firma correcta y rechaza cuerpo alterado", () => {
    const stripe = new Stripe("sk_test_fake");
    const secret = "whsec_test_secret";
    const payload = JSON.stringify(sessionEvent("checkout.session.completed", paidSession, "evt_signed"));
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_signed");
    expect(() => stripe.webhooks.constructEvent(payload.replace("99900", "1"), header, secret)).toThrow();
  });
});
