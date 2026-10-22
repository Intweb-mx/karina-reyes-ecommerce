import { createBonusLink, createManualSale, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantBonusPdf, grantBonusVideo, type BonusStorage } from "../src/server/presale/bonus.ts";
import { hashBonusToken } from "../src/server/presale/fulfillment.ts";
import { NOW, seedCampaign } from "./helpers.ts";

const PROTECTED = { title: "Guía y video", pdfUrl: null, videoUrl: null, pdfKey: "bonus/guia.pdf", videoKey: "bonus/video.mp4" };

class FakeStorage implements BonusStorage {
  signed: { key: string; expiresInSeconds: number; downloadName?: string }[] = [];
  async getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }) {
    this.signed.push({ key, ...options });
    return `https://privado.test/${key}?firma=${this.signed.length}`;
  }
}

let db: Database;
let close: () => Promise<void>;
let storage: FakeStorage;
let campaignId: string;

async function linkFor(expiresAt: Date | null = null): Promise<string> {
  const sale = await createManualSale(db, { campaignId, fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: null, quantity: 1, discountAmount: 0, paymentMethod: "cash", recordedBy: "karina@inttimo.test" }, NOW);
  const token = randomBytes(32).toString("base64url");
  await createBonusLink(db, { reservationId: sale.id, tokenHash: hashBonusToken(token), expiresAt });
  return token;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  storage = new FakeStorage();
  campaignId = (await seedCampaign(db, { bonus: PROTECTED })).id;
});

afterEach(async () => {
  await close();
});

describe("bonus protegido", () => {
  it("el video se entrega con una URL temporal firmada cada vez, sin tope de reproducciones", async () => {
    const token = await linkFor();

    for (let i = 0; i < 10; i++) expect(await grantBonusVideo({ db, storage }, token)).toMatchObject({ status: "ok", url: expect.stringContaining("privado.test/bonus/video.mp4") });

    // La URL real del archivo nunca se entrega: solo una firma de corta vida.
    expect(storage.signed).toHaveLength(10);
    expect(storage.signed.every((s) => s.key === "bonus/video.mp4" && s.expiresInSeconds <= 3600)).toBe(true);
  });

  it("el PDF se puede descargar las veces que haga falta, como archivo", async () => {
    const token = await linkFor();
    for (let i = 0; i < 5; i++) expect(await grantBonusPdf({ db, storage }, token)).toMatchObject({ status: "ok" });
    expect(storage.signed.at(-1)).toMatchObject({ key: "bonus/guia.pdf", downloadName: expect.stringMatching(/\.pdf$/) });
  });

  it("un enlace con fecha de vencimiento pasada (emitido antes del 2026-10-14) sigue sirviendo", async () => {
    const token = await linkFor(new Date(NOW.getTime() - 1000));
    expect(await grantBonusVideo({ db, storage }, token)).toMatchObject({ status: "ok" });
    expect(await grantBonusPdf({ db, storage }, token)).toMatchObject({ status: "ok" });
  });

  it("un enlace desconocido no firma nada", async () => {
    expect(await grantBonusVideo({ db, storage }, "x".repeat(43))).toEqual({ status: "invalid" });
    expect(await grantBonusVideo({ db, storage }, "corto")).toEqual({ status: "invalid" });
    expect(storage.signed).toHaveLength(0);
  });

  it("un bonus con ligas directas (sin archivos propios) no entrega nada por esta vía", async () => {
    await updateCampaign(db, campaignId, { bonus: { title: "Guía", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video" } });
    const token = await linkFor();
    expect(await grantBonusVideo({ db, storage }, token)).toEqual({ status: "unavailable" });
    expect(await grantBonusPdf({ db, storage }, token)).toEqual({ status: "unavailable" });
    expect(storage.signed).toHaveLength(0);
  });
});
