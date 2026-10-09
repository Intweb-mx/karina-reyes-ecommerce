import { findReservationById, listOrderNotes, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextStepFor } from "../src/server/admin/next-step.ts";
import type { FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { manualSaleSchema, recordManualSale, type ManualSaleInput } from "../src/server/presale/manual-sale.ts";
import { seedCampaign } from "./helpers.ts";

const BONUS = { title: "Después de la pregunta", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video", linkDays: 30 };

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let deps: FulfillmentDeps;
let campaignId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  deps = { db, send: async (mail: Mail) => void sent.push(mail), siteUrl: "https://inttimo.test" };
  campaignId = (await seedCampaign(db, { bonus: BONUS, totalUnits: 5, endsAt: new Date("2099-01-01T00:00:00Z") })).id;
});

afterEach(() => close());

const input = (over: Partial<ManualSaleInput> = {}): ManualSaleInput => ({
  campaignId,
  fullName: "Laura Gómez",
  email: "laura@ejemplo.com",
  phone: "6141112233",
  quantity: 1,
  amount: 99_900,
  paymentMethod: "cash",
  delivered: false,
  note: null,
  ...over,
});

describe("formulario de venta manual", () => {
  it("convierte el importe en pesos a centavos y acepta venta sin correo", () => {
    const parsed = manualSaleSchema.parse({ campaignId, fullName: " Laura ", email: "", phone: "", quantity: "2", amount: "$1,000.50", paymentMethod: "transfer", delivered: true, note: "" });
    expect(parsed).toMatchObject({ fullName: "Laura", email: "", phone: null, quantity: 2, amount: 100_050, paymentMethod: "transfer", note: null });
    expect(manualSaleSchema.safeParse({ ...parsed, amount: "abc" }).success).toBe(false);
    expect(manualSaleSchema.safeParse({ ...parsed, amount: "500", email: "no-es-correo" }).success).toBe(false);
  });
});

describe("registrar venta manual", () => {
  it("efectivo con descuento: pagada, confirmación por correo y pendiente de entregar en persona", async () => {
    const result = await recordManualSale(deps, input({ amount: 90_000, note: "Vendido en Iglesia Baluarte" }), "karina@inttimo.test");
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({ confirmation: "sent", delivery: null });
    const row = (await findReservationById(db, result.id))!;
    expect(row).toMatchObject({ status: "paid", paymentMethod: "cash", discountAmount: 9_900, totalAmount: 90_000, fulfillmentStatus: "pending", recordedBy: "karina@inttimo.test" });
    expect(nextStepFor(row)).toEqual({ type: "mark_picked_up" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Forma de pago: Efectivo");
    expect(sent[0]!.text).toContain("ENTREGA EN PERSONA");
    expect((await listOrderNotes(db, result.id)).map((n) => n.body)).toEqual(["Vendido en Iglesia Baluarte"]);
  });

  it("ya entregado: manda confirmación y el correo de entrega con el bonus, una sola vez", async () => {
    const result = await recordManualSale(deps, input({ delivered: true, paymentMethod: "transfer" }), "karina@inttimo.test");
    if (!result.ok) throw new Error(result.error);
    expect(result.delivery).toEqual({ email: "sent", bonus: "sent" });
    const row = (await findReservationById(db, result.id))!;
    expect(row.fulfillmentStatus).toBe("delivered");
    expect(row.bonusSentAt).not.toBeNull();
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining("confirmado"), expect.stringContaining("entregado")]);
    expect(sent[1]!.text).toContain("BONUS DE PREVENTA");
  });

  it("sin correo no manda nada; el bonus queda sin reclamar", async () => {
    const result = await recordManualSale(deps, input({ email: "", delivered: true }), "karina@inttimo.test");
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({ confirmation: "skipped", delivery: { email: "skipped", bonus: "skipped" } });
    expect(sent).toHaveLength(0);
    expect(await findReservationById(db, result.id)).toMatchObject({ fulfillmentStatus: "delivered", bonusSentAt: null, confirmationEmailSentAt: null });
  });

  it("rechaza un importe mayor al precio × cantidad y ventas sin inventario", async () => {
    expect(await recordManualSale(deps, input({ amount: 100_000 }), "k")).toMatchObject({ ok: false, error: expect.stringContaining("no puede ser mayor") });
    expect((await recordManualSale(deps, input({ quantity: 5, amount: 5 * 99_900 }), "k")).ok).toBe(true);
    expect(await recordManualSale(deps, input(), "k")).toEqual({ ok: false, error: "Ya no quedan piezas disponibles en esta preventa." });
    expect(sent).toHaveLength(1);
  });
});
