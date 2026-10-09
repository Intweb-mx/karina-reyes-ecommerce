import { findStoreOrderBySessionId, listStoreOrderEvents, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStoreCheckout } from "../src/server/store/checkout.ts";
import { reconcileStore } from "../src/server/store/reconcile.ts";
import { STORE_TERMS_VERSION } from "../src/server/store/terms.ts";
import { FakeGateway, FakeShipping } from "./helpers.ts";
import { minutesAfter, seedStoreProduct, seedStoreSettings, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let sent: Mail[];
const A = "cs_test_store_000000000001";
const B = "cs_test_store_000000000002";
const send = async (mail: Mail) => void sent.push(mail);

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  sent = [];
  const productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  for (const email of ["ana@ejemplo.com", "beto@ejemplo.com"]) {
    const result = await createStoreCheckout(
      { db, gateway, shipping: new FakeShipping(), siteUrl: "https://inttimo.test", now: () => T0 },
      {
        body: { contact: { fullName: "Cliente Prueba", email }, lines: [{ productId, quantity: 1 }], delivery: { method: "pickup", pickupPointId: "costco" }, acceptTerms: true, termsVersion: STORE_TERMS_VERSION, marketingConsent: false },
        idempotencyKey: null,
        clientIp: null,
      },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.body));
  }
});

afterEach(() => close());

/** Dos horas después: la sesión de B (31 min) ya venció con su gracia. */
const run = () => reconcileStore({ db, gateway, send, notifyEmail: "equipo@inttimo.test" }, { olderThan: new Date(Date.now() + 60_000), now: minutesAfter(120) });

describe("reconciliación de la tienda", () => {
  it("aplica pagos sin webhook, libera lo vencido y manda los correos pendientes", async () => {
    gateway.snapshots.set(A, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_a" });
    const a = (await findStoreOrderBySessionId(db, A))!;

    expect(await run()).toEqual({ checked: 2, updated: [{ orderNumber: a.orderNumber, paymentStatus: "paid" }], released: 1, emails: { sent: 1, failed: 0, exceptions: 0 }, errors: [] });
    expect((await findStoreOrderBySessionId(db, B))?.paymentStatus).toBe("cancelled");
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com", "equipo@inttimo.test"]);
    expect((await listStoreOrderEvents(db, a.id)).map((event) => [event.type, event.source])).toContainEqual(["PAYMENT_APPROVED", "cli"]);

    expect(await run()).toMatchObject({ checked: 0, updated: [], released: 0, emails: { sent: 0 } });
  });

  it("un error con un pedido no detiene a los demás", async () => {
    const original = gateway.retrieveCheckout.bind(gateway);
    gateway.retrieveCheckout = async (sessionId: string) => {
      if (sessionId === A) throw new Error("stripe caído");
      return original(sessionId);
    };
    const a = (await findStoreOrderBySessionId(db, A))!;
    const report = await run();
    expect(report.errors).toEqual([`${a.orderNumber}: Error: stripe caído`]);
    expect(report.released).toBe(2);
  });

  it("un cobro con monto distinto avisa al equipo y no detiene la corrida", async () => {
    gateway.snapshots.set(A, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_a", amountTotal: 1 });
    const a = (await findStoreOrderBySessionId(db, A))!;
    const report = await run();
    expect(report.updated).toEqual([]);
    expect(report.released).toBe(1);
    expect(report.errors).toEqual([]);
    expect(report.emails.failed).toBe(0);
    const notice = sent.find((mail) => mail.subject.includes(a.orderNumber));
    expect(notice).toMatchObject({ to: "equipo@inttimo.test", subject: `Tienda: cobro con monto distinto ${a.orderNumber}` });
    expect((await findStoreOrderBySessionId(db, A))?.paymentStatus).toBe("pending");
  });

  it("si el aviso de monto distinto falla, se cuenta y la corrida sigue", async () => {
    gateway.snapshots.set(A, { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_a", amountTotal: 1 });
    const failing = async () => {
      throw new Error("smtp caído");
    };
    const report = await reconcileStore({ db, gateway, send: failing, notifyEmail: "equipo@inttimo.test" }, { olderThan: new Date(Date.now() + 60_000), now: minutesAfter(120) });
    expect(report.released).toBe(1);
    expect(report.emails.failed).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("aviso de monto distinto");
  });
});
