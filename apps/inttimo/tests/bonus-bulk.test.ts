import { createManualSale, findReservationById, listReservationEvents, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBonusAccess } from "../src/server/presale/bonus.ts";
import { fulfillReservation, sendBonusToAll, type FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { NOW, seedCampaign } from "./helpers.ts";

const BONUS = { title: "Guía y video", pdfUrl: null, videoUrl: null, pdfKey: "bonus/guia.pdf", videoKey: "bonus/video.mp4" };

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let failFor: string | null;
let deps: FulfillmentDeps & { pauseMs: number };
let campaignId: string;

const tokenFrom = (mail: Mail) => mail.text.match(/\/bonus\/([\w-]{43})/)![1]!;

async function sale(email: string, recordedAt = NOW) {
  return createManualSale(db, { campaignId, fullName: "Ana Pérez", email, phone: null, quantity: 1, discountAmount: 0, paymentMethod: "cash", recordedBy: "karina@inttimo.test" }, recordedAt);
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  failFor = null;
  deps = {
    db,
    siteUrl: "https://inttimo.test",
    now: () => NOW,
    pauseMs: 0,
    send: async (mail) => {
      if (mail.to === failFor) throw new Error("resend caído");
      sent.push(mail);
    },
  };
  campaignId = (await seedCampaign(db, { bonus: BONUS })).id;
});

afterEach(async () => {
  await close();
});

describe("enviar bonus a todos", () => {
  it("manda el bonus a toda compra pagada con correo, sin importar entrega ni fecha de pago, y no duplica al repetir", async () => {
    const pending = await sale("ana@ejemplo.com");
    const late = await sale("beto@ejemplo.com", new Date("2026-11-30T12:00:00Z"));
    await sale("");

    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test")).toEqual({ sent: 2, failed: 0, skipped: 1 });
    expect(sent.map((m) => m.to).sort()).toEqual(["ana@ejemplo.com", "beto@ejemplo.com"]);
    expect(sent[0]!.text).toContain("Aquí está tu bonus de preventa");
    expect(await resolveBonusAccess(db, tokenFrom(sent[0]!), NOW)).toMatchObject({ status: "ok" });
    expect((await findReservationById(db, late.id))?.bonusSentAt).not.toBeNull();
    expect((await listReservationEvents(db, pending.id)).find((e) => e.type === "BONUS_SENT")?.metadata).toMatchObject({ bulk: true, reissued: false });

    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test")).toEqual({ sent: 0, failed: 0, skipped: 3 });
    expect(sent).toHaveLength(2);
  });

  it("al marcar ENTREGADO después, confirma la entrega sin volver a mandar el bonus", async () => {
    const order = await sale("ana@ejemplo.com");
    await sendBonusToAll(deps, campaignId, "karina@inttimo.test");
    expect(await fulfillReservation(deps, order.id, { type: "delivered" }, "admin")).toMatchObject({ ok: true, email: "sent", bonus: "skipped" });
    const mail = sent.at(-1)!;
    expect(mail.subject).toContain("entregado");
    expect(mail.text).not.toContain("/bonus/");
    expect(mail.text).toContain("correo aparte");
  });

  it("reenvía a quien ya lo tenía solo si se pide, sin retirar su enlace anterior", async () => {
    await sale("ana@ejemplo.com");
    await sendBonusToAll(deps, campaignId, "karina@inttimo.test");
    const first = tokenFrom(sent[0]!);

    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test", { includeAlreadySent: true })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent[1]!.text).toContain("Aquí está de nuevo");
    expect(tokenFrom(sent[1]!)).not.toBe(first);
    expect(await resolveBonusAccess(db, first, NOW)).toMatchObject({ status: "ok" });
  });

  it("un correo que falla no detiene a los demás y se puede reintentar", async () => {
    const broken = await sale("ana@ejemplo.com");
    await sale("beto@ejemplo.com");
    failFor = "ana@ejemplo.com";

    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test")).toEqual({ sent: 1, failed: 1, skipped: 0 });
    expect((await findReservationById(db, broken.id))?.bonusSentAt).toBeNull();

    failFor = null;
    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test")).toEqual({ sent: 1, failed: 0, skipped: 1 });
    expect(sent.at(-1)!.to).toBe("ana@ejemplo.com");
  });

  it("sin bonus configurado no manda nada", async () => {
    await sale("ana@ejemplo.com");
    await updateCampaign(db, campaignId, { bonus: null });
    expect(await sendBonusToAll(deps, campaignId, "karina@inttimo.test")).toBe("not_configured");
    expect(sent).toHaveLength(0);
  });
});
