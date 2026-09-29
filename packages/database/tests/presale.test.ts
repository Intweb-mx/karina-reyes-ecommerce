import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  applyRefund,
  claimConfirmationEmail,
  claimStripeEvent,
  createReservation,
  generateReservationCode,
  hitRateLimit,
  listReservationEvents,
  markExpired,
  markPaid,
  markPaymentFailed,
  markProcessing,
  upsertCampaign,
  type PresaleCampaign,
} from "../src/presale.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;
let campaign: PresaleCampaign;
const ctx = { source: "stripe" as const };

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  campaign = await upsertCampaign(db, {
    slug: "prueba",
    productName: "Producto de prueba",
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2026-01-15T00:00:00Z"),
    unitAmount: 50_000,
    currency: "mxn",
  });
});

afterAll(() => close());

function newReservation(quantity = 1) {
  return createReservation(db, {
    campaignId: campaign.id,
    fullName: "Cliente Prueba",
    email: "  Cliente@Ejemplo.COM ",
    phone: null,
    quantity,
    unitAmount: campaign.unitAmount,
    currency: campaign.currency,
    answers: { pregunta: "respuesta" },
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
  });
}

describe("campañas", () => {
  it("rechazan fechas invertidas, precio no positivo y moneda inválida", async () => {
    const base = { productName: "x", startsAt: new Date("2026-02-01"), endsAt: new Date("2026-02-15"), unitAmount: 100 };
    await expect(upsertCampaign(db, { ...base, slug: "a", endsAt: new Date("2026-01-01") })).rejects.toThrow();
    await expect(upsertCampaign(db, { ...base, slug: "b", unitAmount: 0 })).rejects.toThrow();
    await expect(upsertCampaign(db, { ...base, slug: "c", currency: "MXN" })).rejects.toThrow();
  });

  it("upsert actualiza por slug sin duplicar", async () => {
    const updated = await upsertCampaign(db, { ...campaign, productName: "Nuevo nombre" });
    expect(updated.id).toBe(campaign.id);
    expect(updated.productName).toBe("Nuevo nombre");
  });
});

describe("reservas", () => {
  it("normalizan email, calculan total y registran evento", async () => {
    const reservation = await newReservation(3);
    expect(reservation.email).toBe("cliente@ejemplo.com");
    expect(reservation.totalAmount).toBe(150_000);
    expect(reservation.code).toMatch(/^PV-[2-9A-HJ-NP-Z]{10}$/);
    const events = await listReservationEvents(db, reservation.id);
    expect(events.map((e) => e.type)).toEqual(["RESERVATION_CREATED"]);
  });

  it("los folios no se repiten", () => {
    const codes = new Set(Array.from({ length: 2000 }, generateReservationCode));
    expect(codes.size).toBe(2000);
  });

  it("el timeline es append-only", async () => {
    const reservation = await newReservation();
    await expect(db.execute(sql`update presale_reservation_events set type = 'X' where reservation_id = ${reservation.id}`)).rejects.toThrow();
    await expect(db.execute(sql`delete from presale_reservation_events where reservation_id = ${reservation.id}`)).rejects.toThrow();
  });
});

describe("transiciones de pago", () => {
  let id: string;
  beforeEach(async () => {
    id = (await newReservation()).id;
  });

  it("pago asíncrono: processing → paid, una sola vez", async () => {
    expect((await markProcessing(db, id, { paymentIntentId: "pi_1" }, ctx))?.status).toBe("processing");
    expect((await markPaid(db, id, { paymentIntentId: "pi_1" }, ctx))?.status).toBe("paid");
    expect(await markPaid(db, id, { paymentIntentId: "pi_1" }, ctx)).toBeNull();
    const events = await listReservationEvents(db, id);
    expect(events.filter((e) => e.type === "PAYMENT_APPROVED")).toHaveLength(1);
  });

  it("una reserva pagada no se degrada por eventos tardíos", async () => {
    await markPaid(db, id, {}, ctx);
    expect(await markExpired(db, id, ctx)).toBeNull();
    expect(await markPaymentFailed(db, id, ctx)).toBeNull();
    expect(await markProcessing(db, id, {}, ctx)).toBeNull();
  });

  it("el dinero recibido gana aunque antes se marcara expirada", async () => {
    await markExpired(db, id, ctx);
    expect((await markPaid(db, id, {}, ctx))?.status).toBe("paid");
  });

  it("reembolsos parciales acumulan y no retroceden", async () => {
    const paid = (await markPaid(db, id, {}, ctx))!;
    const partial = (await applyRefund(db, paid, 10_000, ctx))!;
    expect(partial.status).toBe("partially_refunded");
    expect(await applyRefund(db, partial, 5_000, ctx)).toBeNull();
    const full = (await applyRefund(db, partial, 50_000, ctx))!;
    expect(full.status).toBe("refunded");
    expect(full.amountRefunded).toBe(50_000);
  });

  it("no reembolsa reservas no pagadas", async () => {
    const pending = await newReservation();
    expect(await applyRefund(db, pending, 50_000, ctx)).toBeNull();
  });

  it("el correo de confirmación se reclama una sola vez y solo si está pagada", async () => {
    expect(await claimConfirmationEmail(db, id)).toBeNull();
    await markPaid(db, id, {}, ctx);
    const [a, b] = await Promise.all([claimConfirmationEmail(db, id), claimConfirmationEmail(db, id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});

describe("webhooks y rate limit", () => {
  it("cada evento de Stripe se procesa una sola vez", async () => {
    expect(await claimStripeEvent(db, "evt_1", "checkout.session.completed")).toBe(true);
    expect(await claimStripeEvent(db, "evt_1", "checkout.session.completed")).toBe(false);
  });

  it("el rate limit corta al superar el límite", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(db, "ip:1", 3, 60));
    expect(results).toEqual([false, false, false, true]);
  });
});
