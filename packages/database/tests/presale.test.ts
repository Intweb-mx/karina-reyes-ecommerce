import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  applyRefund,
  attachCheckoutSession,
  claimBonusSend,
  createBonusLink,
  markDelivered,
  markReadyForPickup,
  markShipped,
  openBonusLink,
  claimConfirmationEmail,
  claimStripeEvent,
  countHeldUnits,
  createReservation,
  getRemainingUnits,
  InsufficientStockError,
  generateReservationCode,
  getCampaignStats,
  getCurrentTerms,
  hitRateLimit,
  listReservationEvents,
  logAdminAction,
  publishTerms,
  searchReservations,
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
let termsId: string;
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
  termsId = (await publishTerms(db, campaign.id, "Términos v1", "cli")).id;
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
    termsId,
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

describe("términos versionados", () => {
  it("cada publicación es una versión nueva e inmutable", async () => {
    const v2 = await publishTerms(db, campaign.id, "  Términos v2  ", "admin@inttimo.test");
    expect(v2).toMatchObject({ version: 2, content: "Términos v2" });
    expect((await getCurrentTerms(db, campaign.id))?.id).toBe(v2.id);
    await expect(db.execute(sql`update presale_terms set content = 'x' where id = ${v2.id}`)).rejects.toThrow();
    await expect(db.execute(sql`delete from presale_terms where id = ${v2.id}`)).rejects.toThrow();
  });

  it("publicaciones simultáneas no repiten número", async () => {
    const versions = await Promise.all([1, 2, 3].map((n) => publishTerms(db, campaign.id, `paralelo ${n}`, "cli")));
    expect(new Set(versions.map((v) => v.version)).size).toBe(3);
  });

  it("rechaza términos vacíos", async () => {
    await expect(publishTerms(db, campaign.id, "   ", "cli")).rejects.toThrow();
  });
});

describe("seguridad", () => {
  it("todas las tablas de public tienen RLS activo", async () => {
    const result = await db.execute<{ relname: string }>(
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    const rows = (result as unknown as { rows: { relname: string }[] }).rows;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("la bitácora del panel es append-only", async () => {
    await logAdminAction(db, { actorId: null, actorEmail: "cli", action: "test", targetType: "campaign", targetId: campaign.id });
    await expect(db.execute(sql`delete from admin_audit_log`)).rejects.toThrow();
  });
});

describe("panel", () => {
  it("estadísticas y búsqueda", async () => {
    const a = await newReservation(2);
    await markPaid(db, a.id, {}, ctx);
    const stats = await getCampaignStats(db, campaign.id);
    expect(stats.paidReservations).toBeGreaterThanOrEqual(1);
    expect(stats.paidUnits).toBeGreaterThanOrEqual(2);

    const byCode = await searchReservations(db, campaign.id, { query: a.code.toLowerCase(), limit: 10, offset: 0 });
    expect(byCode.rows.map((r) => r.id)).toEqual([a.id]);
    const wildcard = await searchReservations(db, campaign.id, { query: "%", limit: 10, offset: 0 });
    expect(wildcard.total).toBe(0);
    const paid = await searchReservations(db, campaign.id, { statuses: ["paid"], limit: 1, offset: 0 });
    expect(paid.rows).toHaveLength(1);
    expect(paid.total).toBeGreaterThanOrEqual(1);
  });
});

describe("inventario sin sobreventa", () => {
  const now = new Date("2026-01-05T12:00:00Z");
  let limited: PresaleCampaign;
  let limitedTermsId: string;

  beforeAll(async () => {
    limited = await upsertCampaign(db, { ...campaign, slug: "con-tope", totalUnits: 5 });
    limitedTermsId = (await publishTerms(db, limited.id, "Términos v1", "cli")).id;
  });

  const reserve = (quantity: number, at = now) =>
    createReservation(
      db,
      {
        campaignId: limited.id,
        fullName: "Cliente Prueba",
        email: "cliente@ejemplo.com",
        phone: null,
        quantity,
        unitAmount: limited.unitAmount,
        currency: limited.currency,
        answers: {},
        termsId: limitedTermsId,
        marketingConsent: false,
        idempotencyKey: null,
        attribution: null,
      },
      at,
    );

  it("sin tope no hay límite y getRemainingUnits devuelve null", async () => {
    expect(await getRemainingUnits(db, campaign, now)).toBeNull();
  });

  it("aparta unidades y rechaza lo que exceda el inventario", async () => {
    const first = await reserve(3);
    expect(await getRemainingUnits(db, limited, now)).toBe(2);
    await expect(reserve(3)).rejects.toMatchObject({ name: "InsufficientStockError", remaining: 2 });
    const second = await reserve(2);
    expect(await getRemainingUnits(db, limited, now)).toBe(0);
    await expect(reserve(1)).rejects.toBeInstanceOf(InsufficientStockError);

    // Un pago fallido libera lo apartado; uno pagado lo conserva.
    await markPaymentFailed(db, first.id, ctx);
    expect(await getRemainingUnits(db, limited, now)).toBe(3);
    await markPaid(db, second.id, {}, ctx);
    expect(await getRemainingUnits(db, limited, now)).toBe(3);
  });

  it("compras simultáneas nunca suman más que el tope", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => reserve(1)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(3);
    expect(await countHeldUnits(db, limited.id, now)).toBeLessThanOrEqual(5);
  });

  it("un Checkout vencido libera su cantidad; uno sin sesión solo la aparta unos minutos", async () => {
    const fresh = await upsertCampaign(db, { ...campaign, slug: "vencimientos", totalUnits: 10 });
    const termsId = (await publishTerms(db, fresh.id, "v1", "cli")).id;
    const make = (quantity: number) =>
      createReservation(db, { campaignId: fresh.id, fullName: "Cliente", email: "c@e.com", phone: null, quantity, unitAmount: fresh.unitAmount, currency: "mxn", answers: {}, termsId, marketingConsent: false, idempotencyKey: null, attribution: null });

    const withSession = await make(2);
    await attachCheckoutSession(db, withSession.id, { id: "cs_test_x", url: "https://checkout.test/x", expiresAt: new Date(Date.now() + 3_600_000) });
    await make(3); // sin sesión asociada

    const soon = new Date(Date.now() + 60_000);
    expect(await countHeldUnits(db, fresh.id, soon)).toBe(5);
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect(await countHeldUnits(db, fresh.id, later)).toBe(0);
  });

  it("el reembolso total libera inventario; el parcial no", async () => {
    const fresh = await upsertCampaign(db, { ...campaign, slug: "reembolsos", totalUnits: 2 });
    const termsId = (await publishTerms(db, fresh.id, "v1", "cli")).id;
    const make = (quantity: number) =>
      createReservation(db, { campaignId: fresh.id, fullName: "Cliente", email: "c@e.com", phone: null, quantity, unitAmount: fresh.unitAmount, currency: "mxn", answers: {}, termsId, marketingConsent: false, idempotencyKey: null, attribution: null }, now);
    const paid = (await markPaid(db, (await make(2)).id, {}, ctx))!;
    expect(await getRemainingUnits(db, fresh, now)).toBe(0);
    const partial = (await applyRefund(db, paid, 10_000, ctx))!;
    expect(await getRemainingUnits(db, fresh, now)).toBe(0);
    await applyRefund(db, partial, paid.totalAmount, ctx);
    expect(await getRemainingUnits(db, fresh, now)).toBe(2);
  });
});

describe("entrega y bonus", () => {
  const make = (overrides: Partial<Parameters<typeof createReservation>[1]> = {}) =>
    createReservation(db, {
      campaignId: campaign.id,
      fullName: "Cliente",
      email: "c@e.com",
      phone: null,
      quantity: 2,
      unitAmount: campaign.unitAmount,
      currency: "mxn",
      answers: {},
      termsId,
      marketingConsent: false,
      idempotencyKey: null,
      attribution: null,
      ...overrides,
    });
  const panel = { source: "panel" as const, actor: "admin@inttimo.test" };

  it("el envío se suma al total y la recolección no puede cobrar envío", async () => {
    const shipped = await make({ deliveryMethod: "shipping", shippingAmount: 15_000 });
    expect(shipped.totalAmount).toBe(campaign.unitAmount * 2 + 15_000);
    const pickup = await make({ deliveryMethod: "pickup" });
    expect(pickup).toMatchObject({ deliveryMethod: "pickup", shippingAmount: 0, totalAmount: campaign.unitAmount * 2 });
    await expect(make({ deliveryMethod: "pickup", shippingAmount: 100 })).rejects.toThrow();
  });

  it("solo pedidos pagados avanzan, y cada método por su camino", async () => {
    const pickup = await make({ deliveryMethod: "pickup" });
    expect(await markReadyForPickup(db, pickup.id, panel)).toBeNull(); // sin pagar
    await markPaid(db, pickup.id, {}, ctx);
    expect(await markShipped(db, pickup.id, { carrier: "X", trackingNumber: "1", trackingUrl: null }, panel)).toBeNull(); // es recolección
    expect((await markReadyForPickup(db, pickup.id, panel))?.fulfillmentStatus).toBe("ready_for_pickup");
    expect(await markReadyForPickup(db, pickup.id, panel)).toBeNull(); // una sola vez
    expect((await markDelivered(db, pickup.id, panel))?.deliveredAt).toBeInstanceOf(Date);

    const shipping = await make();
    await markPaid(db, shipping.id, {}, ctx);
    expect(await markReadyForPickup(db, shipping.id, panel)).toBeNull();
    const sent = await markShipped(db, shipping.id, { carrier: "Estafeta", trackingNumber: "123", trackingUrl: "https://rastreo.test/123" }, panel);
    expect(sent).toMatchObject({ fulfillmentStatus: "shipped", carrier: "Estafeta", trackingNumber: "123" });
    const events = await listReservationEvents(db, shipping.id);
    expect(events.find((e) => e.type === "SHIPPED")?.metadata).toMatchObject({ actor: "admin@inttimo.test", trackingNumber: "123" });
  });

  it("el bonus se reclama una vez y solo con el pedido enviado o listo", async () => {
    const reservation = await make({ deliveryMethod: "pickup" });
    await markPaid(db, reservation.id, {}, ctx);
    expect(await claimBonusSend(db, reservation.id)).toBeNull(); // aún en preparación
    await markReadyForPickup(db, reservation.id, panel);
    expect(await claimBonusSend(db, reservation.id)).not.toBeNull();
    expect(await claimBonusSend(db, reservation.id)).toBeNull();
  });

  it("los enlaces se buscan por hash y registran la primera apertura", async () => {
    const reservation = await make();
    await createBonusLink(db, { reservationId: reservation.id, tokenHash: "hash-1", expiresAt: new Date("2030-01-01") });
    const first = await openBonusLink(db, "hash-1");
    expect(first?.reservation.id).toBe(reservation.id);
    expect((await openBonusLink(db, "hash-1"))?.link.firstOpenedAt).toBeInstanceOf(Date);
    expect(await openBonusLink(db, "otro")).toBeNull();
  });
});
