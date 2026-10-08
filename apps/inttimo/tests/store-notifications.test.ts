import { createStoreOrder, findStoreOrderById, listStoreOrderEvents, markStoreOrderPaid, sql, type Database } from "@inttimo/database";
import { createTestDatabase } from "@inttimo/database/testing";
import type { Mail } from "@inttimo/shared-utils/mail";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const failEventOnce = vi.hoisted(() => ({ type: null as string | null }));
vi.mock("@inttimo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inttimo/database")>();
  return {
    ...actual,
    addStoreOrderEvent: (...args: Parameters<typeof actual.addStoreOrderEvent>) => {
      if (failEventOnce.type === args[2]) {
        failEventOnce.type = null;
        return Promise.reject(new Error("insert caído ana@ejemplo.com"));
      }
      return actual.addStoreOrderEvent(...args);
    },
  };
});
import { sendStoreConfirmationIfNeeded } from "../src/server/store/notifications.ts";
import { PICKUP_POINTS } from "./helpers.ts";
import { pickupOrderFor, seedStoreProduct, seedStoreSettings, SHIP_ADDRESS, T0 } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;
let productId: string;
let orderId: string;
let sent: Mail[];
const send = async (mail: Mail) => void sent.push(mail);
const TEAM = "equipo@inttimo.test";

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
  sent = [];
  failEventOnce.type = null;
  productId = (await seedStoreProduct(db)).id;
  await seedStoreSettings(db);
  orderId = (await createStoreOrder(db, pickupOrderFor(productId, 2), T0)).order.id;
});

afterEach(() => {
  vi.restoreAllMocks();
  return close();
});

const pay = (id = orderId, paymentIntentId = "pi_1") => markStoreOrderPaid(db, id, { paymentIntentId }, { source: "stripe" });

describe("correo de pedido pagado", () => {
  it("no se envía mientras el pedido no esté pagado", async () => {
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("skipped");
    expect(sent).toEqual([]);
  });

  it("se envía una sola vez con folio, productos, total y punto, y avisa al equipo", async () => {
    await pay();
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("sent");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("skipped");

    const order = (await findStoreOrderById(db, orderId))!;
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com", TEAM]);
    expect(sent[0]!.subject).toContain(order.orderNumber);
    expect(sent[0]!.text).toContain("UNO+UNO × 2");
    expect(sent[0]!.text).toContain("Total pagado: $1,000.00");
    expect(sent[0]!.text).toContain(`Punto seleccionado: ${PICKUP_POINTS[1]!.name}`);
    expect(sent[0]!.html).toContain("<p>");
    expect(sent[1]!.subject).toBe(`Tienda: pedido pagado ${order.orderNumber}`);
    expect(order.confirmationEmailSentAt).toBeInstanceOf(Date);
    expect((await listStoreOrderEvents(db, orderId)).map((event) => event.type)).toContain("CONFIRMATION_EMAIL_SENT");
  });

  it("si el envío falla, se libera para reintentar", async () => {
    await pay();
    const failing = async () => {
      throw new Error("smtp caído");
    };
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send: failing })).toBe("failed");
    expect((await findStoreOrderById(db, orderId))?.confirmationEmailSentAt).toBeNull();
    expect((await listStoreOrderEvents(db, orderId)).map((event) => event.type)).toContain("CONFIRMATION_EMAIL_FAILED");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("sent");
  });

  it("un fallo del aviso al equipo no cuenta como fallo", async () => {
    await pay();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const customerOnly = async (mail: Mail) => {
      if (mail.to === TEAM) throw new Error("rebote");
      sent.push(mail);
    };
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send: customerOnly, notifyEmail: TEAM })).toBe("sent");
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com"]);
  });

  it("pagado con incidencia: no confirma al cliente, solo avisa al equipo", async () => {
    await pay();
    await db.execute(sql`update store_orders set fulfillment_status = 'exception' where id = ${orderId}`);
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("exception");
    expect(sent.map((mail) => mail.to)).toEqual([TEAM]);
    expect(sent[0]!.subject).toContain("incidencia");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("skipped");
  });

  it("envío a domicilio: dirección y costo de envío", async () => {
    const { order } = await createStoreOrder(
      db,
      pickupOrderFor(productId, 1, {
        delivery: {
          method: "shipping",
          address: SHIP_ADDRESS,
          selection: { provider: "skydropx", quotationId: "quo_1", rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, quotedAt: T0.toISOString() },
        },
        shippingAmount: 18_000,
      }),
      T0,
    );
    await pay(order.id, "pi_2");
    expect(await sendStoreConfirmationIfNeeded(db, order.id, { send })).toBe("sent");
    expect(sent[0]!.text).toContain("Método de entrega: ENVÍO A DOMICILIO");
    expect(sent[0]!.text).toContain(SHIP_ADDRESS.street);
    expect(sent[0]!.text).toContain("Envío: $180.00");
  });
});

describe("incidencias y fallos parciales", () => {
  const makeException = async () => {
    await pay();
    await db.execute(sql`update store_orders set fulfillment_status = 'exception' where id = ${orderId}`);
  };

  it("incidencia sin correo del equipo: registra el error sin PII y consume la reserva", async () => {
    await makeException();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("exception");
    expect(sent).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]![0]);
    expect(logged).toContain("store_exception_notice_unconfigured");
    expect(logged).not.toContain("ana@ejemplo.com");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("skipped");
  });

  it("incidencia con fallo del aviso al equipo: libera la reserva y el reintento lo entrega", async () => {
    await makeException();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = async () => {
      throw new Error("rebote");
    };
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send: failing, notifyEmail: TEAM })).toBe("failed");
    expect((await findStoreOrderById(db, orderId))?.confirmationEmailSentAt).toBeNull();
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("exception");
    expect(sent.map((mail) => mail.to)).toEqual([TEAM]);
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail: TEAM })).toBe("skipped");
  });

  it("si falla el evento tras enviar al cliente, no se libera ni se manda un segundo correo", async () => {
    await pay();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    failEventOnce.type = "CONFIRMATION_EMAIL_SENT";
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("sent");
    expect(spy.mock.calls.map((call) => String(call[0])).join("")).not.toContain("ana@ejemplo.com");
    expect(await sendStoreConfirmationIfNeeded(db, orderId, { send })).toBe("skipped");
    expect(sent.map((mail) => mail.to)).toEqual(["ana@ejemplo.com"]);
  });
});
