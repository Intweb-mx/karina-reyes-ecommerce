import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  addOrderNote,
  createReservation,
  listOrderNotes,
  markPaid,
  markPaymentFailed,
  markShipped,
  publishTerms,
  saveLabel,
  searchAllReservations,
  upsertCampaign,
  type OrderSearch,
  type PresaleCampaign,
} from "../src/presale.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

async function newCampaign(slug: string) {
  const campaign = await upsertCampaign(db, {
    slug,
    productName: "Producto de prueba",
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2026-01-15T00:00:00Z"),
    unitAmount: 50_000,
    currency: "mxn",
  });
  const terms = await publishTerms(db, campaign.id, "Términos v1", "cli");
  return { campaign, termsId: terms.id };
}

function reservation(c: { campaign: PresaleCampaign; termsId: string }, fullName: string, phone: string | null, deliveryMethod: "shipping" | "pickup" = "shipping") {
  return createReservation(db, {
    campaignId: c.campaign.id,
    fullName,
    email: `${fullName.toLowerCase().replace(/\s/g, ".")}@ejemplo.com`,
    phone,
    quantity: 1,
    unitAmount: c.campaign.unitAmount,
    currency: c.campaign.currency,
    deliveryMethod,
    answers: {},
    termsId: c.termsId,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
  });
}

const search = (s: Partial<OrderSearch>) => searchAllReservations(db, { tab: "all", limit: 50, offset: 0, ...s });
const paid = { source: "stripe" as const };

describe("búsqueda global de pedidos", () => {
  it("encuentra por teléfono y por número de guía", async () => {
    const c = await newCampaign("busqueda");
    const a = await reservation(c, "Laura Gómez", "614 555 0101");
    await reservation(c, "Otro Cliente", "614 000 0000");
    await markPaid(db, a.id, {}, paid);
    await saveLabel(db, a.id, { shipmentId: "shp_9", labelUrl: null, carrier: "Estafeta", trackingNumber: "EST987654", trackingUrl: null });

    expect((await search({ campaignId: c.campaign.id, query: "555 0101" })).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await search({ campaignId: c.campaign.id, query: "est987" })).rows.map((r) => r.id)).toEqual([a.id]);
  });

  it("separa por pestañas, cuenta cada una y filtra por método de entrega", async () => {
    const c = await newCampaign("pestanas");
    const toPrepare = await reservation(c, "Por Preparar", null);
    const inTransit = await reservation(c, "En Camino", null);
    const failed = await reservation(c, "Pago Fallido", null);
    const pickup = await reservation(c, "Para Recoger", null, "pickup");
    await reservation(c, "Sin Pagar", null);
    await markPaid(db, toPrepare.id, {}, paid);
    await markPaid(db, inTransit.id, {}, paid);
    await markShipped(db, inTransit.id, { carrier: "DHL", trackingNumber: "D1", trackingUrl: null }, { source: "panel" });
    await markPaymentFailed(db, failed.id, paid);
    await markPaid(db, pickup.id, {}, paid);

    const result = await search({ campaignId: c.campaign.id, tab: "to_prepare" });
    expect(result.rows.map((r) => r.id).sort()).toEqual([toPrepare.id, pickup.id].sort());
    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ to_prepare: 2, in_transit: 1, delivered: 0, canceled: 1, all: 5 });

    const onlyPickup = await search({ campaignId: c.campaign.id, tab: "to_prepare", deliveryMethod: "pickup" });
    expect(onlyPickup.rows.map((r) => r.id)).toEqual([pickup.id]);
  });
});

describe("notas internas", () => {
  it("se agregan en orden y no se pueden editar ni borrar", async () => {
    const c = await newCampaign("notas");
    const a = await reservation(c, "Con Notas", null);
    await addOrderNote(db, { reservationId: a.id, body: "Llamó para cambiar horario", authorEmail: "karina@inttimo.test" });
    await addOrderNote(db, { reservationId: a.id, body: "Confirmado sábado", authorEmail: "leo@inttimo.test" });

    expect((await listOrderNotes(db, a.id)).map((n) => [n.body, n.authorEmail])).toEqual([
      ["Llamó para cambiar horario", "karina@inttimo.test"],
      ["Confirmado sábado", "leo@inttimo.test"],
    ]);
    await expect(db.execute(sql`update presale_order_notes set body = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from presale_order_notes`)).rejects.toThrow();
    await expect(addOrderNote(db, { reservationId: a.id, body: "", authorEmail: "x" })).rejects.toThrow();
  });
});
