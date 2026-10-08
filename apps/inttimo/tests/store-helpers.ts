import {
  adjustStock,
  getStoreProductById,
  saveStoreSettings,
  upsertStoreProduct,
  type Database,
  type NewStoreOrder,
  type NewStoreProduct,
  type StoreProduct,
  type StoreSettingsInput,
} from "@inttimo/database";
import { ADDRESS, PICKUP_POINTS, SHIPPING_PROFILE } from "./helpers.ts";

/** Reloj real: `created_at` lo pone la base con now(), así que las pruebas de la tienda no usan una fecha fija. */
export const T0 = new Date();
export const minutesAfter = (n: number) => new Date(T0.getTime() + n * 60_000);

export const UNO = "uno-mas-uno";
export const AREA = { postalCode: ADDRESS.postalCode, state: ADDRESS.state, city: ADDRESS.city, neighborhood: ADDRESS.neighborhood };
export const SHIP_ADDRESS = { ...ADDRESS, name: "Ana Pérez", phone: "6141234567" };

/** UNO+UNO a la venta con datos de PRUEBA (precio y existencias no son los reales). */
export async function seedStoreProduct(db: Database, options: { stock?: number } & Partial<NewStoreProduct> = {}): Promise<StoreProduct> {
  const { stock = 20, ...overrides } = options;
  const product = await upsertStoreProduct(db, {
    slug: UNO,
    name: "UNO+UNO",
    published: true,
    saleStatus: "on_sale",
    price: 50_000,
    weightGrams: 1000,
    lengthCm: 16,
    widthCm: 11,
    heightCm: 11,
    territories: ["conversacion", "conexion"],
    ...overrides,
  });
  if (stock > 0) await adjustStock(db, { productId: product.id, delta: stock, reason: "reception", actor: "test" });
  return product;
}

export function seedStoreSettings(db: Database, overrides: Partial<StoreSettingsInput> = {}) {
  return saveStoreSettings(db, { pickupEnabled: true, pickupPoints: PICKUP_POINTS, shippingEnabled: true, shippingProfile: SHIPPING_PROFILE, ...overrides }, { overwrite: true });
}

export async function inventoryOf(db: Database, productId: string) {
  const product = (await getStoreProductById(db, productId))!;
  return { onHand: product.onHand, reserved: product.reserved };
}

export function pickupOrderFor(productId: string, quantity: number, overrides: Partial<NewStoreOrder> = {}): NewStoreOrder {
  return {
    contact: { fullName: "Ana Pérez", email: "ana@ejemplo.com", phone: null },
    lines: [{ productId, quantity }],
    delivery: { method: "pickup", pickupPointId: "costco" },
    shippingAmount: 0,
    termsVersion: 1,
    marketingConsent: false,
    idempotencyKey: null,
    attribution: null,
    ...overrides,
  };
}
