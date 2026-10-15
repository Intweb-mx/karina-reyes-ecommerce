import { createManualSale, findReservationById, listReservationEvents, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BONUS_RESEND_COOLDOWN_MS, resendBonusByToken, resolveBonusAccess } from "../src/server/presale/bonus.ts";
import { fulfillReservation, reissueBonus, type FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { NOW, seedCampaign } from "./helpers.ts";

const DAY = 86_400_000;
const BONUS = { title: "Guía y video", pdfUrl: null, videoUrl: null, pdfKey: "bonus/guia.pdf", videoKey: "bonus/video.mp4" };

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let failMail = false;
let now = NOW;
let deps: FulfillmentDeps;
let campaignId: string;

const tokenFrom = (mail: Mail) => mail.text.match(/\/bonus\/([\w-]{43})/)![1]!;

async function deliveredSale(): Promise<{ id: string; token: string }> {
  const sale = await createManualSale(db, { campaignId, fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: null, quantity: 1, discountAmount: 0, paymentMethod: "cash", recordedBy: "karina@inttimo.test" }, NOW);
  await fulfillReservation(deps, sale.id, { type: "delivered" }, "admin");
  return { id: sale.id, token: tokenFrom(sent.at(-1)!) };
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  failMail = false;
  now = NOW;
  deps = {
    db,
    siteUrl: "https://inttimo.test",
    now: () => now,
    send: async (mail) => {
      if (failMail) throw new Error("resend caído");
      sent.push(mail);
    },
  };
  campaignId = (await seedCampaign(db, { bonus: BONUS })).id;
});

afterEach(async () => {
  await close();
});

describe("reenviar bonus con enlace nuevo", () => {
  it("el enlace no vence por el paso del tiempo", async () => {
    const { token } = await deliveredSale();
    now = new Date(NOW.getTime() + 400 * DAY);
    expect(await resolveBonusAccess(db, token, now)).toMatchObject({ status: "ok" });
  });

  it("manda un enlace nuevo al correo de la compra y deja el historial", async () => {
    const { id, token: first } = await deliveredSale();
    expect(await reissueBonus(deps, id, "karina@inttimo.test")).toBe("sent");
    const mail = sent.at(-1)!;
    expect(mail.to).toBe("ana@ejemplo.com");
    expect(mail.text).toContain("de nuevo");
    const second = tokenFrom(mail);
    expect(second).not.toBe(first);
    expect(await resolveBonusAccess(db, second, now)).toMatchObject({ status: "ok" });
    expect((await listReservationEvents(db, id)).filter((e) => e.type === "BONUS_SENT")).toHaveLength(2);
  });

  it("el enlace anterior deja de funcionar al emitir el nuevo (una sola liga viva)", async () => {
    const { id, token: first } = await deliveredSale();
    expect(await reissueBonus(deps, id, "karina@inttimo.test")).toBe("sent");
    expect(await resolveBonusAccess(db, first, now)).toMatchObject({ status: "expired" });
    expect(await resolveBonusAccess(db, tokenFrom(sent.at(-1)!), now)).toMatchObject({ status: "ok" });
  });

  it("si el correo falla no se pierde el enlace anterior ni queda una liga huérfana", async () => {
    const { id, token: first } = await deliveredSale();
    failMail = true;
    expect(await reissueBonus(deps, id, "karina@inttimo.test")).toBe("failed");
    expect(await resolveBonusAccess(db, first, now)).toMatchObject({ status: "ok" });
    const events = await listReservationEvents(db, id);
    expect(events.some((e) => e.type === "BONUS_FAILED")).toBe(true);

    failMail = false;
    expect(await reissueBonus(deps, id, "karina@inttimo.test")).toBe("sent");
    expect(sent).toHaveLength(2);
  });

  it("no aplica si nunca se envió el bonus, si no está entregado o si no hay bonus configurado", async () => {
    const sale = await createManualSale(db, { campaignId, fullName: "Luis Gómez", email: "luis@ejemplo.com", phone: null, quantity: 1, discountAmount: 0, paymentMethod: "cash", recordedBy: "karina@inttimo.test" }, NOW);
    expect(await reissueBonus(deps, sale.id, "karina@inttimo.test")).toBe("skipped"); // aún no entregado
    expect(sent).toHaveLength(0);

    await fulfillReservation(deps, sale.id, { type: "delivered" }, "admin");
    await updateCampaign(db, campaignId, { bonus: null });
    expect(await reissueBonus(deps, sale.id, "karina@inttimo.test")).toBe("not_configured");
    expect((await findReservationById(db, sale.id))?.bonusSentAt).not.toBeNull();
  });

  it("sin envío previo no reenvía: eso es del botón normal 'Reintentar bonus'", async () => {
    await updateCampaign(db, campaignId, { bonus: null });
    const sale = await createManualSale(db, { campaignId, fullName: "Eva Ruiz", email: "eva@ejemplo.com", phone: null, quantity: 1, discountAmount: 0, paymentMethod: "cash", recordedBy: "karina@inttimo.test" }, NOW);
    await fulfillReservation(deps, sale.id, { type: "delivered" }, "admin"); // sin bonus configurado: queda sin enviar
    await updateCampaign(db, campaignId, { bonus: BONUS });
    expect(await reissueBonus(deps, sale.id, "karina@inttimo.test")).toBe("never_sent");
    expect(sent.filter((m) => m.text.includes("/bonus/"))).toHaveLength(0);
  });

  describe("el cliente lo pide desde un enlace que ya no sirve", () => {
    it("manda un enlace nuevo al correo de la compra y muestra el correo enmascarado", async () => {
      const { id, token: first } = await deliveredSale();
      expect(await reissueBonus(deps, id, "karina@inttimo.test")).toBe("sent"); // el equipo emitió otro: `first` quedó retirado
      now = new Date(NOW.getTime() + BONUS_RESEND_COOLDOWN_MS + 1);

      expect(await resendBonusByToken(deps, first)).toEqual({ status: "sent", emailHint: "an•••@ejemplo.com" });
      const mail = sent.at(-1)!;
      expect(mail.to).toBe("ana@ejemplo.com");
      expect(await resolveBonusAccess(db, tokenFrom(mail), now)).toMatchObject({ status: "ok" });
      const event = (await listReservationEvents(db, id)).filter((e) => e.type === "BONUS_SENT").at(-1)!;
      expect(event).toMatchObject({ source: "api", metadata: { actor: "cliente", reissued: true } });
    });

    it("no manda nada si el enlace sigue sirviendo", async () => {
      const { token } = await deliveredSale();
      expect(await resendBonusByToken(deps, token)).toEqual({ status: "still_valid" });
      expect(sent).toHaveLength(1);
    });

    it("respeta el intervalo mínimo: un segundo clic no retira el enlace recién enviado", async () => {
      const { id, token: first } = await deliveredSale();
      await reissueBonus(deps, id, "karina@inttimo.test");
      const second = tokenFrom(sent.at(-1)!);

      expect(await resendBonusByToken(deps, first)).toEqual({ status: "too_soon" });
      expect(sent).toHaveLength(2);
      expect(await resolveBonusAccess(db, second, now)).toMatchObject({ status: "ok" });

      now = new Date(now.getTime() + BONUS_RESEND_COOLDOWN_MS + 1);
      expect(await resendBonusByToken(deps, first)).toMatchObject({ status: "sent" });
    });

    it("token desconocido o mal formado no manda nada", async () => {
      expect(await resendBonusByToken(deps, "x".repeat(43))).toEqual({ status: "invalid" });
      expect(await resendBonusByToken(deps, "corto")).toEqual({ status: "invalid" });
      expect(sent).toHaveLength(0);
    });

    it("si el correo falla avisa y se puede volver a pedir", async () => {
      const { id, token: first } = await deliveredSale();
      await reissueBonus(deps, id, "karina@inttimo.test");
      now = new Date(NOW.getTime() + BONUS_RESEND_COOLDOWN_MS + 1);
      failMail = true;
      expect(await resendBonusByToken(deps, first)).toEqual({ status: "failed" });
      failMail = false;
      expect(await resendBonusByToken(deps, first)).toMatchObject({ status: "sent" });
    });
  });
});
