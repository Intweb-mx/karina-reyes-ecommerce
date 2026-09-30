import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { getFeaturedCampaign, upsertCampaign } from "../src/presale.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const seed = (slug: string, status: "draft" | "active" | "closed", startsAt: string) =>
  upsertCampaign(db, { slug, productName: slug, status, startsAt: new Date(startsAt), endsAt: new Date("2030-01-01"), unitAmount: 100 });

describe("campaña destacada", () => {
  it("no hay ninguna si solo existen borradores", async () => {
    await seed("borrador", "draft", "2026-09-01");
    expect(await getFeaturedCampaign(db)).toBeNull();
  });

  it("prefiere la activa aunque haya una cerrada más reciente", async () => {
    await seed("activa", "active", "2026-01-01");
    await seed("cerrada", "closed", "2026-06-01");
    await seed("borrador", "draft", "2026-09-01");
    expect((await getFeaturedCampaign(db))?.slug).toBe("activa");
  });

  it("sin activas, muestra la última cerrada", async () => {
    await seed("vieja", "closed", "2026-01-01");
    await seed("reciente", "closed", "2026-06-01");
    expect((await getFeaturedCampaign(db))?.slug).toBe("reciente");
  });
});
