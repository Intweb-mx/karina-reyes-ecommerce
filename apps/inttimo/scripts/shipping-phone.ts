/**
 * Cambia el teléfono del remitente que va en las guías de SkyDropX: en la configuración de entrega de la tienda y en
 * cada preventa con envío configurado. No toca nada más (dirección, paquete, paqueterías).
 *
 *   pnpm shipping:phone --phone=6145315250                          # muestra qué cambiaría
 *   pnpm shipping:phone --phone=6145315250 --apply --allow-remote   # producción (DATABASE_URL exportada)
 */
import { createDatabase, getStoreSettings, listCampaigns, logAdminAction, setShippingOriginPhone } from "@inttimo/database";
import { arg, fail, flag, storeDatabaseUrl } from "./cli.ts";

const phone = (arg("phone") ?? fail("Falta --phone=6145315250 (10 dígitos).")).replace(/\D/g, "");
if (!/^\d{10}$/.test(phone)) fail("--phone debe tener 10 dígitos.");

const db = createDatabase(storeDatabaseUrl());
const store = (await getStoreSettings(db))?.shippingProfile;
console.log(`  tienda: ${store ? store.origin.phone : "sin envío configurado"}`);
for (const campaign of await listCampaigns(db)) {
  console.log(`  preventa ${campaign.slug}: ${campaign.shippingProfile ? campaign.shippingProfile.origin.phone : "sin envío configurado"}`);
}
if (!flag("apply")) {
  console.log(`Sin guardar. Repite con --apply para cambiarlo a ${phone}.`);
  process.exit(0);
}

const changed = await setShippingOriginPhone(db, phone);
for (const change of changed) {
  await logAdminAction(db, { actorId: null, actorEmail: "cli", action: "shipping_origin.phone", targetType: "shipping_profile", targetId: null, metadata: { target: change.target, before: change.before, after: phone } });
  console.log(`  ${change.target}: ${change.before} → ${phone}`);
}
console.log(changed.length ? "Listo." : `Nada que cambiar: ya era ${phone}.`);
process.exit(0);
