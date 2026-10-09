/**
 * Carga el catálogo inicial de la tienda (hoy solo UNO+UNO) y la configuración de entrega.
 *
 *   pnpm store:seed                  # escribe en la base de DATABASE_URL (la local por defecto)
 *   pnpm store:seed --allow-remote   # obligatorio si DATABASE_URL no es localhost (producción)
 *
 * - UNO+UNO: sin precio, como "próximamente" y con 0 existencias. Si ya existe no cambia nada (no pisa el precio ni las
 *   existencias fijadas desde el panel). Peso y medidas salen del paquete de la preventa.
 * - Entrega (`store_settings`): se COPIA de docs/preventa/uno-mas-uno.json (puntos de recolección, envío, origen, paquete,
 *   paqueterías, carta porte). Nada inventado. Si ya existe no se pisa.
 */
import { readFile } from "node:fs/promises";
import { createDatabase, getStoreProductBySlug, getStoreSettings, saveStoreSettings, upsertStoreProduct, type PickupPoint, type ShippingProfile } from "@inttimo/database";
import { fail, flag } from "./cli.ts";

const url = process.env.DATABASE_URL ?? fail("Falta DATABASE_URL.");
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  fail("DATABASE_URL no es una URL válida.");
}
if (parsed.port === "54322") fail("DATABASE_URL apunta al puerto 54322 (la base de otro proyecto): no se usa.");
const host = parsed.hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !flag("allow-remote")) {
  fail(`DATABASE_URL apunta a ${host}, no a una base local. Si de verdad es la base real, repite con --allow-remote.`);
}
console.log(`Base: ${host}`);

const db = createDatabase(url);
const SLUG = "uno-mas-uno";

const campaign = JSON.parse(await readFile(new URL("../../../docs/preventa/uno-mas-uno.json", import.meta.url), "utf8")) as {
  pickupEnabled?: boolean;
  pickupPoints?: PickupPoint[];
  shippingEnabled?: boolean;
  shippingProfile?: ShippingProfile | null;
};

if (await getStoreProductBySlug(db, SLUG)) {
  console.log(`  ${SLUG}: ya existe, sin cambios.`);
} else {
  const parcel = campaign.shippingProfile?.parcel;
  const product = await upsertStoreProduct(db, {
    slug: SLUG,
    name: "UNO+UNO",
    type: "physical",
    saleStatus: "coming_soon",
    published: true,
    price: null,
    weightGrams: parcel?.weightKg ? Math.round(parcel.weightKg * 1000) : null,
    lengthCm: parcel?.lengthCm ?? null,
    widthCm: parcel?.widthCm ?? null,
    heightCm: parcel?.heightCm ?? null,
    // Misma clasificación que el simulador del frontend (src/lib/store/mock.ts); confirmar con Karina.
    territories: ["conversacion", "conexion", "intimidad", "conocimiento"],
  });
  console.log(`  ${product.slug}: creado (próximamente, sin precio, 0 existencias).`);
}

if (await getStoreSettings(db)) {
  console.log("  entrega: ya configurada, sin cambios.");
} else {
  const settings = await saveStoreSettings(db, {
    pickupEnabled: campaign.pickupEnabled ?? false,
    pickupPoints: campaign.pickupPoints ?? [],
    shippingEnabled: campaign.shippingEnabled ?? false,
    shippingProfile: campaign.shippingProfile ?? null,
  });
  console.log(`  entrega: copiada de la preventa (recolección ${settings.pickupEnabled ? "sí" : "no"}, ${settings.pickupPoints.length} puntos; envío ${settings.shippingEnabled ? "sí" : "no"}).`);
}
process.exit(0);
