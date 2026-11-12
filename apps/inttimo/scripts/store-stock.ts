/**
 * Registra una entrada o salida de inventario de la tienda (queda un movimiento con motivo y autor; nunca se sobrescribe
 * el número). Los paquetes descuentan del producto base: aquí siempre se ajusta el producto base (p. ej. uno-mas-uno).
 *
 *   pnpm store:stock --slug=uno-mas-uno                                   # muestra existencias
 *   pnpm store:stock --slug=uno-mas-uno --delta=200 --reason=reception --note="Llegada de imprenta"
 *   ... --allow-remote                                                    # producción (DATABASE_URL exportada)
 *
 * Motivos: reception (entrada), adjustment, damage (merma, resta), return (devolución, suma), correction.
 *
 * Carga inicial con lo que sobró de la preventa (tope de la campaña − unidades vendidas en ella):
 *   pnpm store:stock --slug=uno-mas-uno --from-presale=uno-mas-uno            # solo muestra el cálculo
 *   pnpm store:stock --slug=uno-mas-uno --from-presale=uno-mas-uno --apply    # lo registra (solo si hoy hay 0)
 */
import { adjustStock, createDatabase, getCampaignBySlug, getRemainingUnits, getStoreProductBySlug, type StockAdjustmentReason } from "@inttimo/database";
import { arg, fail, flag, storeDatabaseUrl } from "./cli.ts";

const REASONS: StockAdjustmentReason[] = ["reception", "adjustment", "damage", "return", "correction"];
const slug = arg("slug") ?? fail("Falta --slug=producto (p. ej. uno-mas-uno).");
const deltaArg = arg("delta");
const reason = (arg("reason") ?? "reception") as StockAdjustmentReason;
if (!REASONS.includes(reason)) fail(`--reason debe ser uno de: ${REASONS.join(", ")}.`);

const db = createDatabase(storeDatabaseUrl());
const product = (await getStoreProductBySlug(db, slug)) ?? fail(`No existe el producto ${slug}.`);
const show = (p: { onHand: number; reserved: number; available: number }) => `existencias ${p.onHand} · apartadas ${p.reserved} · disponibles ${p.available}`;
console.log(`  ${product.slug}: ${show(product)}`);

const presaleSlug = arg("from-presale");
if (presaleSlug !== undefined && deltaArg !== undefined) fail("Usa --from-presale o --delta, no los dos.");
if (presaleSlug !== undefined) {
  const campaign = (await getCampaignBySlug(db, presaleSlug)) ?? fail(`No existe la preventa ${presaleSlug}.`);
  if (campaign.totalUnits === null) fail(`La preventa ${presaleSlug} no tiene tope de unidades: no hay de dónde calcular el sobrante.`);
  const remaining = (await getRemainingUnits(db, campaign))!;
  console.log(`  preventa ${presaleSlug}: tope ${campaign.totalUnits} · vendidas o apartadas ${campaign.totalUnits - remaining} · sobran ${remaining}`);
  if (!flag("apply")) {
    console.log("  Sin guardar. Repite con --apply para registrarlas como existencias de la tienda.");
    process.exit(0);
  }
  // Solo como carga inicial: con existencias ya registradas, sumar el sobrante duplicaría piezas.
  if (product.onHand !== 0 || product.reserved !== 0) fail("La tienda ya tiene existencias registradas: ajusta con --delta en vez de --from-presale.");
  if (remaining === 0) fail("No sobró ninguna pieza de la preventa.");
  await adjustStock(db, { productId: product.id, delta: remaining, reason: "reception", actor: "cli", note: `Sobrante de la preventa ${presaleSlug}` }).catch((error: unknown) =>
    fail(error instanceof Error ? error.message : String(error)),
  );
  console.log(`  ${product.slug}: ${show((await getStoreProductBySlug(db, slug))!)}`);
  process.exit(0);
}
if (deltaArg === undefined) process.exit(0);

const delta = Number(deltaArg);
if (!Number.isInteger(delta) || delta === 0) fail("--delta debe ser un entero distinto de cero (negativo para restar).");
await adjustStock(db, { productId: product.id, delta, reason, actor: "cli", note: arg("note") ?? null }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
console.log(`  ${product.slug}: ${show((await getStoreProductBySlug(db, slug))!)}`);
process.exit(0);
