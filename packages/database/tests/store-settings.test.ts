import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { createStoreOrder, getStoreSettings, getStoreShippingQuote, saveStoreSettings, saveStoreShippingQuote } from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";
import { pickupOrder, seedProduct } from "./store-helpers.ts";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});

afterEach(() => close());

const POINTS = [{ id: "costco", name: "Punto de prueba", schedule: "Horario de prueba" }];
/** Datos de prueba (no son los reales de inttimo). */
const PROFILE = {
  origin: { name: "Origen Prueba", company: null, street: "Calle 1", neighborhood: "Centro", city: "Chihuahua", state: "Chihuahua", postalCode: "31000", phone: "6140000000", email: "origen@prueba.test", reference: null },
  parcel: { weightKg: 1, lengthCm: 16, widthCm: 11, heightCm: 11 },
  carriers: [] as string[],
  consignmentNote: "00000000",
  packageType: "box",
};

describe("configuración de entrega de la tienda", () => {
  it("no existe hasta que se guarda", async () => {
    expect(await getStoreSettings(db)).toBeNull();
  });

  it("sin overwrite no pisa lo configurado; con overwrite lo reemplaza", async () => {
    const first = await saveStoreSettings(db, { pickupEnabled: true, pickupPoints: POINTS, shippingEnabled: false, shippingProfile: null });
    expect(first).toMatchObject({ id: "default", pickupEnabled: true, pickupPoints: POINTS, shippingEnabled: false, shippingProfile: null });

    const kept = await saveStoreSettings(db, { pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE });
    expect(kept).toMatchObject({ pickupEnabled: true, shippingEnabled: false });

    const replaced = await saveStoreSettings(db, { pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE }, { overwrite: true });
    expect(replaced).toMatchObject({ pickupEnabled: false, pickupPoints: [], shippingEnabled: true, shippingProfile: PROFILE });
  });

  it("solo existe una fila", async () => {
    await expect(db.execute(sql`insert into store_settings (id) values ('otra')`)).rejects.toThrow();
  });
});

describe("cotizaciones de envío de la tienda", () => {
  it("guarda y lee; un id que no es UUID no existe", async () => {
    const quote = await saveStoreShippingQuote(db, {
      lines: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
      postalCode: "06600",
      quotationId: "quo_1",
      currency: "mxn",
      options: [{ id: "economico", rateId: "rate_eco", carrier: "Estafeta", service: "Terrestre", days: 5, amount: 18_000 }],
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await getStoreShippingQuote(db, quote.id)).toMatchObject({ postalCode: "06600", currency: "mxn", lines: [{ quantity: 2 }], options: [{ rateId: "rate_eco", amount: 18_000 }] });
    expect(await getStoreShippingQuote(db, "no-es-uuid")).toBeNull();
  });
});

describe("pedidos", () => {
  it("nacen sin correo de confirmación enviado", async () => {
    const product = await seedProduct(db);
    const { order } = await createStoreOrder(db, pickupOrder([{ productId: product.id, quantity: 1 }]));
    expect(order.confirmationEmailSentAt).toBeNull();
  });
});
