import { readFile } from "node:fs/promises";
import { findReservationById, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaignConfigSchema } from "../src/server/presale/campaign-config.ts";
import { reconcilePresale } from "../src/server/presale/reconcile.ts";
import { createPresaleReservation } from "../src/server/presale/reservations.ts";
import { FakeGateway, NOW, QUESTIONS, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

describe("configuración de campaña", () => {
  const base = { slug: "uno-mas-uno", productName: "UNO+UNO", status: "active", startsAt: "2026-10-01T10:00:00-06:00", unitAmount: 99_900, questions: QUESTIONS };

  it("calcula el cierre a 14 días por defecto", () => {
    const result = campaignConfigSchema.parse(base);
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(14 * 86_400_000);
    expect(result.endsAt.toISOString()).toBe("2026-10-15T16:00:00.000Z");
  });

  it("la plantilla de ejemplo no se puede cargar sin precio ni fecha aprobados", async () => {
    const example = JSON.parse(await readFile(new URL("../../../docs/preventa/campaign.example.json", import.meta.url), "utf8"));
    const result = campaignConfigSchema.safeParse(example);
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["startsAt", "unitAmount"]));
  });

  it("rechaza precio decimal, fechas sin zona y slug inválido", () => {
    expect(campaignConfigSchema.safeParse({ ...base, unitAmount: 999.5 }).success).toBe(false);
    expect(campaignConfigSchema.safeParse({ ...base, startsAt: "2026-10-01" }).success).toBe(false);
    expect(campaignConfigSchema.safeParse({ ...base, slug: "Uno Mas Uno" }).success).toBe(false);
  });
});

describe("reconciliación", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeEach(async () => {
    ({ db, close } = await createTestDatabase());
    await seedCampaign(db);
  });
  afterEach(() => close());

  it("recupera un pago cuyo webhook nunca llegó y envía la confirmación", async () => {
    const gateway = new FakeGateway();
    const created = await createPresaleReservation(
      { db, gateway, siteUrl: "https://inttimo.test", now: () => NOW },
      { slug: "uno-mas-uno", body: { fullName: "Ana", email: "ana@ejemplo.com", answers: VALID_ANSWERS, acceptTerms: true, termsVersion: 1 }, idempotencyKey: null, clientIp: null },
    );
    expect(created.ok).toBe(true);
    gateway.snapshots.set("cs_test_000000000001", { status: "complete", paymentStatus: "paid", paymentIntentId: "pi_9" });

    const sent: Mail[] = [];
    const report = await reconcilePresale({ db, gateway, send: async (mail) => void sent.push(mail) }, { olderThan: new Date(Date.now() + 60_000) });

    expect(report).toMatchObject({ checked: 1, emails: { sent: 1, failed: 0 }, errors: [] });
    expect(report.updated[0]?.status).toBe("paid");
    expect(sent).toHaveLength(1);
    const reservation = (await db.query.presaleReservations.findFirst())!;
    expect((await findReservationById(db, reservation.id))?.confirmationEmailSentAt).not.toBeNull();
  });
});
