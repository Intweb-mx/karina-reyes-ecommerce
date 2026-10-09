import { createHmac } from "node:crypto";
import { findReservationById, listReservationEvents, markPaid, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FulfillmentDeps } from "../src/server/presale/fulfillment.ts";
import { createPresaleReservation, type PresaleDeps } from "../src/server/presale/reservations.ts";
import { generateLabel, quoteShipping } from "../src/server/presale/shipping.ts";
import { handleSkydropxWebhook, verifySkydropxSignature } from "../src/server/presale/skydropx-webhook.ts";
import { ADDRESS, FakeGateway, FakeShipping, NOW, seedCampaign, VALID_ANSWERS } from "./helpers.ts";

const SECRET = "clave-secreta-de-prueba";
const BONUS = { title: "Guía y video de preventa", pdfUrl: "https://archivos.test/guia.pdf", videoUrl: "https://archivos.test/video", linkDays: 30 };

let db: Database;
let close: () => Promise<void>;
let sent: Mail[];
let deps: FulfillmentDeps;
let presale: PresaleDeps;
let shipping: FakeShipping;

const sign = (body: string, secret = SECRET) => `HMAC ${createHmac("sha512", secret).update(body).digest("hex")}`;

function packageEvent(status: string, tracking = "GUIA123", shipmentId = "shp_1") {
  return JSON.stringify({
    data: {
      id: "pkg_1",
      type: "packages",
      attributes: { status, tracking_number: tracking, tracking_url_provider: `https://rastreo.test/${tracking}`, label_url: "https://etiquetas.test/1.pdf", returned_status: null, returned: false },
      relationships: { shipment: { data: { id: shipmentId, type: "shipments" } } },
    },
  });
}

async function receive(body: string, header: string | null = sign(body)) {
  return handleSkydropxWebhook(deps, SECRET, body, header);
}

async function shippingOrderWithLabel() {
  const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
  const quoted = await quoteShipping({ db, provider: shipping, now: () => NOW }, { slug: "uno-mas-uno", body: { ...ADDRESS, quantity: 1 }, clientIp: ip });
  if (!quoted.ok) throw new Error(JSON.stringify(quoted.body));
  const result = await createPresaleReservation(presale, {
    slug: "uno-mas-uno",
    body: {
      fullName: "Ana Pérez",
      email: "ana@ejemplo.com",
      answers: VALID_ANSWERS,
      acceptTerms: true,
      termsVersion: 1,
      deliveryMethod: "shipping",
      phone: "6141234567",
      shipping: { quoteId: quoted.data.quoteId, optionId: "economico", address: ADDRESS },
    },
    idempotencyKey: null,
    clientIp: ip,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.body));
  const id = (presale.gateway as FakeGateway).created.at(-1)!.reservationId;
  await markPaid(db, id, {}, { source: "stripe" });
  await db.execute(`update presale_reservations set paid_at = '${NOW.toISOString()}' where id = '${id}'`);
  await generateLabel({ db, provider: shipping, now: () => NOW }, id, "admin");
  return id;
}

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  deps = { db, send: async (mail: Mail) => void sent.push(mail), siteUrl: "https://inttimo.test", now: () => NOW };
  shipping = new FakeShipping();
  presale = { db, gateway: new FakeGateway(), shipping, siteUrl: "https://inttimo.test", now: () => NOW };
  await seedCampaign(db, { bonus: BONUS });
});

afterEach(() => close());

describe("firma HMAC de SkyDropX", () => {
  const body = packageEvent("delivered");

  it("acepta la firma correcta y rechaza cuerpo alterado, otra clave o encabezado inválido", () => {
    expect(verifySkydropxSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySkydropxSignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifySkydropxSignature(body, sign(body, "otra-clave"), SECRET)).toBe(false);
    expect(verifySkydropxSignature(body, null, SECRET)).toBe(false);
    expect(verifySkydropxSignature(body, `Bearer ${SECRET}`, SECRET)).toBe(false);
    expect(verifySkydropxSignature(body, "HMAC abc", SECRET)).toBe(false);
  });

  it("responde 401 sin firma válida y no toca ningún pedido", async () => {
    const id = await shippingOrderWithLabel();
    expect(await receive(body, null)).toMatchObject({ status: 401 });
    expect(await receive(body, sign(body, "otra-clave"))).toMatchObject({ status: 401 });
    expect((await findReservationById(db, id))?.fulfillmentStatus).toBe("pending");
    expect(sent).toHaveLength(0);
  });

  it("firmado pero con JSON inválido responde 400", async () => {
    const broken = "{no es json";
    expect(await receive(broken)).toMatchObject({ status: 400 });
  });
});

describe("avisos de rastreo de SkyDropX", () => {
  it("en tránsito marca ENVIADO, manda la guía con el enlace de rastreo y no libera el bonus", async () => {
    const id = await shippingOrderWithLabel();
    const result = await receive(packageEvent("in_transit"));
    expect(result).toEqual({ status: 200, body: { received: true, result: "shipped" } });
    expect(await findReservationById(db, id)).toMatchObject({ fulfillmentStatus: "shipped", trackingUrl: "https://rastreo.test/GUIA123", bonusSentAt: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("GUIA123");
    expect(sent[0]!.text).toContain("https://rastreo.test/GUIA123");
    expect(sent[0]!.text).not.toContain("BONUS DE PREVENTA");
    const source = (await listReservationEvents(db, id)).find((e) => e.type === "SHIPPED")?.source;
    expect(source).toBe("skydropx");
  });

  it("entregado marca ENTREGADO y manda el correo con el bonus, una sola vez aunque el aviso se repita", async () => {
    const id = await shippingOrderWithLabel();
    await receive(packageEvent("in_transit"));
    sent = [];

    expect((await receive(packageEvent("delivered"))).body).toEqual({ received: true, result: "delivered" });
    expect(await findReservationById(db, id)).toMatchObject({ fulfillmentStatus: "delivered" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain("entregado");
    expect(sent[0]!.text).toContain("BONUS DE PREVENTA");

    expect((await receive(packageEvent("delivered"))).body).toEqual({ received: true, result: "unchanged" });
    expect(sent).toHaveLength(1);
  });

  it("un aviso tardío de tránsito después de entregado no cambia nada", async () => {
    const id = await shippingOrderWithLabel();
    await receive(packageEvent("delivered"));
    const emails = sent.length;
    expect((await receive(packageEvent("in_transit"))).body).toEqual({ received: true, result: "unchanged" });
    expect((await findReservationById(db, id))?.fulfillmentStatus).toBe("delivered");
    expect(sent).toHaveLength(emails);
  });

  it("si Karina ya marcó ENVIADO a mano, el aviso de entregado solo manda el correo de entrega", async () => {
    const id = await shippingOrderWithLabel();
    const { handToCarrier } = await import("../src/server/presale/fulfillment.ts");
    await handToCarrier(deps, id, "karina");
    sent = [];
    expect((await receive(packageEvent("delivered"))).body).toEqual({ received: true, result: "delivered" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("BONUS DE PREVENTA");
  });

  it("estatus que no cambian el pedido, guías desconocidas y eventos que no son de paquetes se aceptan sin efecto", async () => {
    const id = await shippingOrderWithLabel();
    expect((await receive(packageEvent("exception"))).body).toEqual({ received: true, result: "ignored" });
    expect((await receive(packageEvent("in_transit", "OTRA999", "shp_otro"))).body).toEqual({ received: true, result: "ignored" });
    expect((await receive(JSON.stringify({ data: { id: "o1", type: "orders", attributes: { status: "sent" } } }))).body).toEqual({ received: true, result: "ignored" });
    expect((await findReservationById(db, id))?.fulfillmentStatus).toBe("pending");
    expect(sent).toHaveLength(0);
  });

  it("no actúa sobre pedidos no pagados", async () => {
    const id = await shippingOrderWithLabel();
    await db.execute(`update presale_reservations set status = 'refunded', amount_refunded = total_amount where id = '${id}'`);
    expect((await receive(packageEvent("delivered"))).body).toEqual({ received: true, result: "ignored" });
    expect((await findReservationById(db, id))?.fulfillmentStatus).toBe("pending");
  });
});
