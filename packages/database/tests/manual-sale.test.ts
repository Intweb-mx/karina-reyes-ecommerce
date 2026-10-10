import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  claimConfirmationEmail,
  countHeldUnits,
  createManualSale,
  createReservation,
  getCampaignStats,
  InsufficientStockError,
  listPaidWithoutConfirmation,
  listReservationEvents,
  markDelivered,
  markPaid,
  publishTerms,
  upsertCampaign,
  type NewManualSale,
} from "../src/presale.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

let n = 0;
async function newCampaign(totalUnits: number | null = 10) {
  n += 1;
  const campaign = await upsertCampaign(db, {
    slug: `venta-manual-${n}`,
    productName: "UNO+UNO",
    status: "active",
    startsAt: new Date("2026-10-01T06:00:00Z"),
    endsAt: new Date("2026-10-16T05:59:00Z"),
    unitAmount: 50_000,
    currency: "mxn",
    totalUnits,
  });
  const terms = await publishTerms(db, campaign.id, "Términos v1", "cli");
  return { campaign, termsId: terms.id };
}

const sale = (campaignId: string, over: Partial<NewManualSale> = {}): NewManualSale => ({
  campaignId,
  fullName: "  Laura Gómez ",
  email: " Laura@Ejemplo.com ",
  phone: "6141112233",
  quantity: 2,
  discountAmount: 0,
  paymentMethod: "cash",
  recordedBy: "karina@inttimo.test",
  ...over,
});

describe("venta registrada a mano", () => {
  it("queda pagada al instante, sin Stripe ni términos, con precio de campaña y su historial", async () => {
    const { campaign } = await newCampaign();
    const row = await createManualSale(db, sale(campaign.id, { discountAmount: 10_000 }));
    expect(row).toMatchObject({
      status: "paid",
      paymentMethod: "cash",
      recordedBy: "karina@inttimo.test",
      fullName: "Laura Gómez",
      email: "laura@ejemplo.com",
      quantity: 2,
      unitAmount: 50_000,
      discountAmount: 10_000,
      totalAmount: 90_000,
      deliveryMethod: "pickup",
      pickupPointId: null,
      termsId: null,
      stripeCheckoutSessionId: null,
      fulfillmentStatus: "pending",
    });
    expect(row.code).toMatch(/^PV-/);
    expect(row.paidAt).not.toBeNull();
    const types = (await listReservationEvents(db, row.id)).map((e) => e.type);
    expect(types).toEqual(["RESERVATION_CREATED", "MANUAL_SALE_RECORDED", "PAYMENT_APPROVED"]);
  });

  it("descuenta inventario y nunca vende más de lo que hay", async () => {
    const { campaign } = await newCampaign(3);
    await createManualSale(db, sale(campaign.id, { quantity: 2 }));
    expect(await countHeldUnits(db, campaign.id)).toBe(2);
    await expect(createManualSale(db, sale(campaign.id, { quantity: 2 }))).rejects.toBeInstanceOf(InsufficientStockError);
    await createManualSale(db, sale(campaign.id, { quantity: 1 }));
    expect(await countHeldUnits(db, campaign.id)).toBe(3);
  });

  it("la base rechaza descuentos mayores al subtotal y compras en línea sin términos", async () => {
    const { campaign, termsId } = await newCampaign();
    await expect(createManualSale(db, sale(campaign.id, { quantity: 1, discountAmount: 60_000 }))).rejects.toThrow();
    const online = await createReservation(db, {
      campaignId: campaign.id,
      fullName: "Ana",
      email: "ana@ejemplo.com",
      phone: null,
      quantity: 1,
      unitAmount: 50_000,
      currency: "mxn",
      answers: {},
      termsId,
      marketingConsent: false,
      idempotencyKey: null,
      attribution: null,
    });
    await expect(db.execute(sql`update presale_reservations set terms_id = null where id = ${online.id}`)).rejects.toThrow();
  });

  it("sin correo no reclama la confirmación ni aparece como confirmación pendiente", async () => {
    const { campaign } = await newCampaign();
    const withEmail = await createManualSale(db, sale(campaign.id, { quantity: 1 }));
    const noEmail = await createManualSale(db, sale(campaign.id, { quantity: 1, email: "" }));
    expect(await claimConfirmationEmail(db, noEmail.id)).toBeNull();
    const pending = (await listPaidWithoutConfirmation(db)).map((r) => r.id);
    expect(pending).toContain(withEmail.id);
    expect(pending).not.toContain(noEmail.id);
  });

  it("una entrega en persona pasa de pendiente a entregado; un envío pendiente no", async () => {
    const { campaign, termsId } = await newCampaign();
    const manual = await createManualSale(db, sale(campaign.id, { quantity: 1 }));
    expect(await markDelivered(db, manual.id, { source: "panel" })).toMatchObject({ fulfillmentStatus: "delivered" });

    const shipping = await createReservation(db, {
      campaignId: campaign.id,
      fullName: "Beto",
      email: "beto@ejemplo.com",
      phone: null,
      quantity: 1,
      unitAmount: 50_000,
      currency: "mxn",
      deliveryMethod: "shipping",
      answers: {},
      termsId,
      marketingConsent: false,
      idempotencyKey: null,
      attribution: null,
    });
    await markPaid(db, shipping.id, {}, { source: "stripe" });
    expect(await markDelivered(db, shipping.id, { source: "panel" })).toBeNull();
  });

  it("el resumen separa lo cobrado por Stripe, en efectivo y por transferencia", async () => {
    const { campaign, termsId } = await newCampaign();
    await createManualSale(db, sale(campaign.id, { quantity: 1, paymentMethod: "cash" }));
    await createManualSale(db, sale(campaign.id, { quantity: 1, paymentMethod: "transfer", discountAmount: 5_000 }));
    const online = await createReservation(db, {
      campaignId: campaign.id,
      fullName: "Ana",
      email: "ana@ejemplo.com",
      phone: null,
      quantity: 1,
      unitAmount: 50_000,
      currency: "mxn",
      answers: {},
      termsId,
      marketingConsent: false,
      idempotencyKey: null,
      attribution: null,
    });
    await markPaid(db, online.id, {}, { source: "stripe" });

    const stats = await getCampaignStats(db, campaign.id);
    expect(stats.revenueByMethod).toEqual({ stripe: 50_000, cash: 50_000, transfer: 45_000 });
    expect(stats.netRevenue).toBe(145_000);
    expect(stats.paidReservations).toBe(3);
    expect(stats.byStatus.paid).toBe(3);
  });
});
