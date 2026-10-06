import { randomUUID } from "node:crypto";
import { addOrderNote, createReservation, getCurrentTerms, markPaid, markReadyForPickup, saveLabel, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInbox } from "../src/server/admin/inbox.ts";
import { getOrderDetail, parseOrderQuery, searchOrders } from "../src/server/admin/orders.ts";
import { ADDRESS, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

let db: Database;
let close: () => Promise<void>;
let campaignId: string;
let termsId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  const campaign = await seedCampaign(db);
  campaignId = campaign.id;
  termsId = (await getCurrentTerms(db, campaign.id))!.id;
});

afterEach(() => close());

async function order({ method = "shipping", address = true, paid = true, phone = "6141234567" }: { method?: "shipping" | "pickup"; address?: boolean; paid?: boolean; phone?: string } = {}) {
  const r = await createReservation(db, {
    campaignId,
    fullName: "Ana Pérez",
    email: "ana@ejemplo.com",
    phone,
    quantity: 1,
    unitAmount: 99_900,
    currency: "mxn",
    deliveryMethod: method,
    pickupPointId: method === "pickup" ? "costco" : null,
    deliveryAddress: method === "shipping" && address ? { name: "Ana Pérez", phone, ...ADDRESS } : null,
    answers: VALID_ANSWERS,
    termsId,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
  });
  if (paid) await markPaid(db, r.id, {}, { source: "stripe" });
  return r.id;
}

describe("Por hacer", () => {
  it("reparte los pedidos pagados según su siguiente paso", async () => {
    const toLabel = await order();
    const toHandOver = await order();
    await saveLabel(db, toHandOver, { shipmentId: "shp_1", labelUrl: "https://etiquetas.test/1.pdf", carrier: "Estafeta", trackingNumber: "GUIA1", trackingUrl: null });
    const toNotify = await order({ method: "pickup" });
    const waiting = await order({ method: "pickup" });
    await markReadyForPickup(db, waiting, { source: "panel" });
    await order({ paid: false });

    const inbox = await getInbox(db, new Date());
    expect(inbox.toLabel.map((o) => o.id)).toEqual([toLabel]);
    expect(inbox.toLabel[0]).toMatchObject({ campaignName: "UNO+UNO", fullName: "Ana Pérez" });
    expect(inbox.toHandOver.map((o) => o.id)).toEqual([toHandOver]);
    expect(inbox.toNotify.map((o) => o.id)).toEqual([toNotify]);
    expect(inbox.awaitingPickup).toMatchObject([{ id: waiting, waitingDays: 0 }]);
    expect(inbox.incidents).toEqual([]);
  });

  it("muestra incidencias: sin dirección y confirmación sin enviar", async () => {
    const noAddress = await order({ address: false });
    const inbox = await getInbox(db, new Date(Date.now() + 20 * 60_000));
    expect(inbox.incidents.filter((i) => i.id === noAddress).map((i) => i.incident).sort()).toEqual(["confirmation_email_failed", "missing_address"]);
  });
});

describe("Pedidos", () => {
  it("interpreta los filtros de la URL y descarta valores inválidos", () => {
    expect(parseOrderQuery({})).toEqual({ tab: "to_prepare", page: 1 });
    expect(parseOrderQuery({ tab: "x", entrega: "pickup", campana: "no-es-uuid", pagina: "3", q: "  ana " })).toEqual({ tab: "to_prepare", deliveryMethod: "pickup", page: 3, q: "ana" });
    expect(parseOrderQuery({ tab: "all", campana: campaignId })).toEqual({ tab: "all", campaignId, page: 1 });
  });

  it("busca en todas las preventas por teléfono", async () => {
    const id = await order({ phone: "6149998877" });
    await order();
    const list = await searchOrders(db, { q: "9998877", tab: "all", page: 1 });
    expect(list.rows.map((r) => r.id)).toEqual([id]);
    expect(list).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(list.campaigns.map((c) => c.slug)).toContain("uno-mas-uno");
  });

  it("arma el detalle con siguiente paso, dirección, respuestas, notas e historial", async () => {
    const id = await order();
    await addOrderNote(db, { reservationId: id, body: "Pidió envío rápido", authorEmail: "karina@inttimo.test" });

    const detail = await getOrderDetail(db, id);
    expect(detail?.nextStep).toEqual({ type: "generate_label", blocked: null, inProgress: false });
    expect(detail?.delivery.address).toContain(`${ADDRESS.street}, ${ADDRESS.neighborhood}`);
    expect(detail?.answers).toContainEqual({ label: "¿Cómo nos conociste?", value: "Redes" });
    expect(detail?.notes.map((n) => n.body)).toEqual(["Pidió envío rápido"]);
    expect(detail?.timeline.map((e) => e.type)).toEqual(expect.arrayContaining(["RESERVATION_CREATED", "PAYMENT_APPROVED"]));
    expect(detail?.payment.termsVersion).toBe(1);
    expect(await getOrderDetail(db, randomUUID())).toBeNull();
  });
});
