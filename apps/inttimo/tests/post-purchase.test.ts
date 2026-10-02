import { getPostPurchaseAnswers, markPaid, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPresaleReservation, type PresaleDeps } from "../src/server/presale/reservations.ts";
import { savePostPurchaseAnswersService } from "../src/server/presale/postPurchase.ts";
import { FakeGateway, FakeShipping, NOW, VALID_ANSWERS, seedCampaign } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let presale: PresaleDeps;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  presale = { db, gateway: new FakeGateway(), shipping: new FakeShipping(), siteUrl: "https://inttimo.test", now: () => NOW };
  await seedCampaign(db);
});

afterEach(() => close());

async function paidReservationWithSession() {
  const result = await createPresaleReservation(presale, {
    slug: "uno-mas-uno",
    body: { fullName: "Ana Pérez", email: "ana@ejemplo.com", answers: VALID_ANSWERS, acceptTerms: true, termsVersion: 1, deliveryMethod: "pickup", pickupPointId: "costco" },
    idempotencyKey: null,
    clientIp: "10.0.0.1",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  const gateway = presale.gateway as FakeGateway;
  const created = gateway.created.at(-1)!;
  const id = created.reservationId;
  const sessionId = `cs_test_${String(gateway.created.length).padStart(12, "0")}`;
  await markPaid(db, id, {}, { source: "stripe" });
  return { id, sessionId };
}

describe("cuestionario posterior a la compra", () => {
  it("guarda respuestas parciales sin enviar y luego el envío final", async () => {
    const { id, sessionId } = await paidReservationWithSession();

    const partial = await savePostPurchaseAnswersService({ db }, { body: { sessionId, answers: { forWhom: "couple" }, submit: false }, clientIp: "1.2.3.4" });
    expect(partial).toMatchObject({ ok: true, data: { saved: true } });
    expect(await getPostPurchaseAnswers(db, id)).toMatchObject({ answers: { forWhom: "couple" }, submittedAt: null });

    const final = await savePostPurchaseAnswersService(
      { db },
      { body: { sessionId, answers: { forWhom: "couple", yearsTogether: "1_5", growArea: "intimacy" }, submit: true }, clientIp: "1.2.3.4" },
    );
    expect(final.ok).toBe(true);
    const saved = await getPostPurchaseAnswers(db, id);
    expect(saved?.answers).toEqual({ forWhom: "couple", yearsTogether: "1_5", growArea: "intimacy" });
    expect(saved?.submittedAt).not.toBeNull();
  });

  it("las 3 preguntas son opcionales: se puede enviar sin responder ninguna", async () => {
    const { sessionId } = await paidReservationWithSession();
    const result = await savePostPurchaseAnswersService({ db }, { body: { sessionId, answers: {}, submit: true }, clientIp: "1.2.3.4" });
    expect(result).toMatchObject({ ok: true, data: { saved: true } });
  });

  it("rechaza un valor fuera de las opciones y un session_id desconocido", async () => {
    const { sessionId } = await paidReservationWithSession();
    const badValue = await savePostPurchaseAnswersService({ db }, { body: { sessionId, answers: { forWhom: "not_a_valid_option" }, submit: false }, clientIp: "1.2.3.4" });
    expect(badValue.ok).toBe(false);

    const unknown = await savePostPurchaseAnswersService({ db }, { body: { sessionId: "cs_test_000000000000", answers: {}, submit: true }, clientIp: "1.2.3.4" });
    expect(unknown).toMatchObject({ ok: false, status: 404 });
  });
});
