import { createBonusLink, createManualSale, updateCampaign, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BONUS_VIDEO_MAX_PLAYS, grantBonusPdf, grantBonusVideo, resolveBonusAccess, type BonusStorage } from "../src/server/presale/bonus.ts";
import { hashBonusToken } from "../src/server/presale/fulfillment.ts";
import { NOW, seedCampaign } from "./helpers.ts";

const DAY = 86_400_000;
const PROTECTED = { title: "Guía y video", pdfUrl: null, videoUrl: null, pdfKey: "bonus/guia.pdf", videoKey: "bonus/video.mp4", linkDays: 30 };

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

async function linkFor(expiresAt = new Date(NOW.getTime() + 30 * DAY)): Promise<string> {
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
  it("el video se entrega con una URL temporal y se agota a la tercera reproducción", async () => {
    const token = await linkFor();
    expect(BONUS_VIDEO_MAX_PLAYS).toBe(3);

    const first = await grantBonusVideo({ db, storage }, token, NOW);
    expect(first).toMatchObject({ status: "ok", playsLeft: 2 });
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toMatchObject({ status: "ok", playsLeft: 1 });
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toMatchObject({ status: "ok", playsLeft: 0 });
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toEqual({ status: "exhausted" });

    // La URL real del archivo nunca se entrega: solo una firma de corta vida, y solo 3 veces.
    expect(storage.signed).toHaveLength(3);
    expect(storage.signed.every((s) => s.key === "bonus/video.mp4" && s.expiresInSeconds <= 3600)).toBe(true);
  });

  it("solicitudes simultáneas no pasan del tope", async () => {
    const token = await linkFor();
    const results = await Promise.all(Array.from({ length: 6 }, () => grantBonusVideo({ db, storage }, token, NOW)));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(3);
    expect(results.filter((r) => r.status === "exhausted")).toHaveLength(3);
    expect(storage.signed).toHaveLength(3);
  });

  it("cada enlace lleva su propia cuenta", async () => {
    const a = await linkFor();
    const b = await linkFor();
    for (let i = 0; i < 3; i++) await grantBonusVideo({ db, storage }, a, NOW);
    expect(await grantBonusVideo({ db, storage }, a, NOW)).toEqual({ status: "exhausted" });
    expect(await grantBonusVideo({ db, storage }, b, NOW)).toMatchObject({ status: "ok", playsLeft: 2 });
  });

  it("el PDF se puede descargar las veces que haga falta, como archivo", async () => {
    const token = await linkFor();
    for (let i = 0; i < 5; i++) expect(await grantBonusPdf({ db, storage }, token, NOW)).toMatchObject({ status: "ok" });
    expect(storage.signed.at(-1)).toMatchObject({ key: "bonus/guia.pdf", downloadName: expect.stringMatching(/\.pdf$/) });
  });

  it("si el almacenamiento falla, el cliente no pierde su reproducción", async () => {
    const token = await linkFor();
    const broken: BonusStorage = { getSignedUrl: async () => { throw new Error("bucket caído"); } };
    await expect(grantBonusVideo({ db, storage: broken }, token, NOW)).rejects.toThrow("bucket caído");
    expect(await resolveBonusAccess(db, token, NOW)).toMatchObject({ videoPlaysLeft: 3 });
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toMatchObject({ status: "ok", playsLeft: 2 });
  });

  it("un enlace vencido o desconocido no consume reproducciones ni firma nada", async () => {
    const token = await linkFor(new Date(NOW.getTime() - 1000));
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toMatchObject({ status: "expired" });
    expect(await grantBonusPdf({ db, storage }, token, NOW)).toMatchObject({ status: "expired" });
    expect(await grantBonusVideo({ db, storage }, "x".repeat(43), NOW)).toEqual({ status: "invalid" });
    expect(await grantBonusVideo({ db, storage }, "corto", NOW)).toEqual({ status: "invalid" });
    expect(storage.signed).toHaveLength(0);
  });

  it("un bonus con ligas directas (sin archivos propios) no entrega nada por esta vía", async () => {
    await updateCampaign(db, campaignId, { bonus: { title: "Guía", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video", linkDays: 30 } });
    const token = await linkFor();
    expect(await grantBonusVideo({ db, storage }, token, NOW)).toEqual({ status: "unavailable" });
    expect(await grantBonusPdf({ db, storage }, token, NOW)).toEqual({ status: "unavailable" });
    expect(storage.signed).toHaveLength(0);
  });

  it("la página sabe cuántas reproducciones quedan", async () => {
    const token = await linkFor();
    expect(await resolveBonusAccess(db, token, NOW)).toMatchObject({ status: "ok", videoPlaysLeft: 3 });
    await grantBonusVideo({ db, storage }, token, NOW);
    expect(await resolveBonusAccess(db, token, NOW)).toMatchObject({ status: "ok", videoPlaysLeft: 2 });
  });
});
