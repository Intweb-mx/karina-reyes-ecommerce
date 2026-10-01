import { findReservationBySessionId, getCampaignBySlug, listReservationEvents, publishTerms, sql, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateReservationResponse } from "../src/server/presale/contract.ts";
import { createPresaleReservation, getPublicCampaign, getReservationStatus, maskEmail, type PresaleDeps } from "../src/server/presale/reservations.ts";
import { FakeGateway, NOW, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let gateway: FakeGateway;
let deps: PresaleDeps;
const onPaid = vi.fn(async () => {});

const body = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Ana Pérez",
  email: "Ana@Ejemplo.com",
  answers: VALID_ANSWERS,
  acceptTerms: true,
  termsVersion: 1,
  ...overrides,
});

const create = (overrides: Record<string, unknown> = {}, extra: { idempotencyKey?: string | null; clientIp?: string | null } = {}) =>
  createPresaleReservation(deps, { slug: "uno-mas-uno", body: body(overrides), idempotencyKey: extra.idempotencyKey ?? null, clientIp: extra.clientIp ?? "1.2.3.4" });

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  gateway = new FakeGateway();
  onPaid.mockClear();
  deps = { db, gateway, siteUrl: "https://inttimo.test/", now: () => NOW, onPaid };
  await seedCampaign(db);
});

afterEach(() => close());

describe("campaña pública", () => {
  it("expone fechas, fase y hora del servidor para el contador", async () => {
    const result = await getPublicCampaign(deps, "uno-mas-uno");
    expect(result.ok && result.data).toMatchObject({
      phase: "open",
      endsAt: "2026-10-15T00:00:00.000Z",
      serverTime: NOW.toISOString(),
      unitAmount: 99_900,
    });
  });

  it("los borradores no existen para el público", async () => {
    await seedCampaign(db, { status: "draft" });
    expect((await getPublicCampaign(deps, "uno-mas-uno")).status).toBe(404);
    expect((await create()).status).toBe(404);
  });
});

describe("inventario de la campaña", () => {
  it("expone el tope y no marca agotada mientras haya unidades", async () => {
    await seedCampaign(db, { totalUnits: 3 });
    const result = await getPublicCampaign(deps, "uno-mas-uno");
    expect(result.ok && result.data).toMatchObject({ totalUnits: 3, soldOut: false });
  });

  it("rechaza con sold_out lo que excede las unidades restantes y no crea pago", async () => {
    await seedCampaign(db, { totalUnits: 3 });
    expect((await create({ quantity: 2 })).status).toBe(201);
    const result = await create({ quantity: 2 }, { clientIp: "5.6.7.8" });
    expect(result).toMatchObject({ ok: false, status: 409, body: { error: { code: "sold_out", fieldErrors: { quantity: ["Solo quedan 1 unidades disponibles."] } } } });
    expect(gateway.created).toHaveLength(1);
  });

  it("al agotarse marca soldOut y rechaza toda compra nueva", async () => {
    await seedCampaign(db, { totalUnits: 2 });
    expect((await create({ quantity: 2 })).status).toBe(201);
    const campaign = await getPublicCampaign(deps, "uno-mas-uno");
    expect(campaign.ok && campaign.data.soldOut).toBe(true);
    const result = await create({ quantity: 1 }, { clientIp: "5.6.7.8" });
    expect(result).toMatchObject({ ok: false, status: 409, body: { error: { code: "sold_out", message: "Las unidades de preventa se agotaron." } } });
  });

  it("si Stripe falla el inventario se libera", async () => {
    await seedCampaign(db, { totalUnits: 1 });
    gateway.fail = true;
    expect((await create()).status).toBe(503);
    gateway.fail = false;
    expect((await create({}, { clientIp: "5.6.7.8" })).status).toBe(201);
  });
});

describe("crear reserva", () => {
  it("crea la reserva con el precio del servidor y la sesión de Stripe", async () => {
    const result = await create({ quantity: 2, unitAmount: 1 });
    expect(result.status).toBe(201);
    const data = (result as { data: CreateReservationResponse }).data;
    expect(data.reservationCode).toMatch(/^PV-/);
    expect(data.checkoutUrl).toContain("checkout.stripe.test");

    const [input] = gateway.created;
    expect(input).toMatchObject({ unitAmount: 99_900, quantity: 2, email: "ana@ejemplo.com", currency: "mxn" });
    expect(input!.successUrl).toBe("https://inttimo.test/preventa/uno-mas-uno/confirmacion?session_id={CHECKOUT_SESSION_ID}");
    expect(input!.expiresAt.getTime() - NOW.getTime()).toBe(60 * 60_000);

    const reservation = await findReservationBySessionId(db, "cs_test_000000000001");
    expect(reservation).toMatchObject({ status: "pending_payment", totalAmount: 199_800, answers: VALID_ANSWERS });
    const events = await listReservationEvents(db, reservation!.id);
    expect(events.map((e) => e.type)).toEqual(["RESERVATION_CREATED", "CHECKOUT_CREATED"]);
  });

  it("rechaza fuera de fechas con la fase", async () => {
    deps.now = () => new Date("2026-09-30T00:00:00Z");
    expect((await create()) as unknown).toMatchObject({ status: 409, body: { error: { code: "presale_not_open", phase: "upcoming" } } });
    deps.now = () => new Date("2026-10-15T00:00:00Z");
    expect((await create()) as unknown).toMatchObject({ status: 409, body: { error: { phase: "closed" } } });
  });

  it("devuelve errores por campo", async () => {
    const result = await create({ email: "no-es-correo", acceptTerms: false, answers: { como_nos_conociste: "tv" } });
    expect(result.status).toBe(400);
    const errors = !result.ok ? result.body.error.fieldErrors : undefined;
    expect(Object.keys(errors ?? {})).toEqual(expect.arrayContaining(["email", "acceptTerms", "answers.como_nos_conociste", "answers.acepta_contacto"]));

    const answers = await create({ answers: { como_nos_conociste: "tv" } });
    const answerErrors = !answers.ok ? answers.body.error.fieldErrors : undefined;
    expect(Object.keys(answerErrors ?? {})).toEqual(expect.arrayContaining(["answers.como_nos_conociste", "answers.acepta_contacto"]));
    expect(gateway.created).toHaveLength(0);
  });

  it("exige aceptar la versión vigente de los términos y la guarda", async () => {
    const campaign = (await getCampaignBySlug(db, "uno-mas-uno"))!;
    await publishTerms(db, campaign.id, "Términos v2", "test");
    expect((await create()) as unknown).toMatchObject({ status: 409, body: { error: { code: "terms_outdated" } } });
    expect((await create({ termsVersion: 2 })).status).toBe(201);
    const reservation = (await db.query.presaleReservations.findFirst())!;
    const terms = await db.query.presaleTerms.findFirst({ where: (t, { eq }) => eq(t.id, reservation.termsId) });
    expect(terms?.version).toBe(2);
    const publicCampaign = await getPublicCampaign(deps, "uno-mas-uno");
    expect(publicCampaign.ok && publicCampaign.data.terms).toEqual({ version: 2, content: "Términos v2" });
  });

  it("sin términos publicados no acepta reservas", async () => {
    await seedCampaign(db, { slug: "sin-terminos" });
    await db.execute(sql`alter table presale_terms disable trigger presale_terms_no_update_delete`);
    await db.execute(sql`delete from presale_terms where campaign_id = (select id from presale_campaigns where slug = 'sin-terminos')`);
    const result = await createPresaleReservation(deps, { slug: "sin-terminos", body: body(), idempotencyKey: null, clientIp: null });
    expect(result as unknown).toMatchObject({ status: 503, body: { error: { code: "presale_not_ready" } } });
  });

  it("respeta el máximo por reserva y el honeypot", async () => {
    expect((await create({ quantity: 4 })).status).toBe(400);
    expect((await create({ website: "spam" })).status).toBe(400);
    expect(gateway.created).toHaveLength(0);
  });

  it("la misma Idempotency-Key devuelve la misma sesión", async () => {
    const first = await create({}, { idempotencyKey: "clave-unica-123" });
    const second = await create({}, { idempotencyKey: "clave-unica-123" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.ok && first.ok && second.data.checkoutUrl === first.data.checkoutUrl).toBe(true);
    expect(gateway.created).toHaveLength(1);
  });

  it("si Stripe falla responde 503 y la reserva queda cancelada, no pendiente", async () => {
    gateway.fail = true;
    const result = await create();
    expect(result).toMatchObject({ status: 503, body: { error: { code: "payment_unavailable" } } });
    const rows = await db.query.presaleReservations.findMany();
    expect(rows.map((r) => r.status)).toEqual(["canceled"]);
  });

  it("limita intentos por correo", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await create({}, { clientIp: `10.0.0.${i}` })).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe("estado de la reserva", () => {
  it("sincroniza con Stripe al volver del pago aunque el webhook no haya llegado", async () => {
    await create();
    gateway.snapshots.set("cs_test_000000000001", { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_1" });
    const result = await getReservationStatus(deps, { slug: "uno-mas-uno", sessionId: "cs_test_000000000001" });
    expect(result.ok && result.data).toMatchObject({ status: "paid", email: "a***@ejemplo.com", totalAmount: 99_900 });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("pago en OXXO pendiente queda en processing", async () => {
    await create();
    gateway.snapshots.set("cs_test_000000000001", { status: "complete", paymentStatus: "unpaid" });
    const result = await getReservationStatus(deps, { slug: "uno-mas-uno", sessionId: "cs_test_000000000001" });
    expect(result.ok && result.data.status).toBe("processing");
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("no revela reservas con session_id inválido o de otra campaña", async () => {
    await create();
    expect((await getReservationStatus(deps, { slug: "uno-mas-uno", sessionId: "123" })).status).toBe(400);
    expect((await getReservationStatus(deps, { slug: "otra", sessionId: "cs_test_000000000001" })).status).toBe(404);
    expect((await getReservationStatus(deps, { slug: "uno-mas-uno", sessionId: "cs_test_999999999999" })).status).toBe(404);
  });

  it("enmascara el correo", () => {
    expect(maskEmail("cliente@gmail.com")).toBe("c***@gmail.com");
  });
});
