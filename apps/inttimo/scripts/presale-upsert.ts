/**
 * Crea o actualiza una campaña de preventa desde un JSON (por slug).
 *
 *   pnpm presale:upsert --file=docs/preventa/campaign.example.json
 *   pnpm presale:upsert --file=... --dry-run      # solo valida
 *   pnpm presale:upsert --file=... --terms=terminos.md   # publica términos (versión nueva si cambiaron)
 *   pnpm presale:upsert --file=... --terms-legal         # publica los Términos y Condiciones aprobados (src/content/legal)
 *
 * Si el JSON no trae endsAt, el cierre es startsAt + durationDays (14 por defecto).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase, getCampaignBySlug, getCurrentTerms, listReservations, logAdminAction, publishTerms, upsertCampaign } from "@inttimo/database";
import { renderLegalText } from "../src/content/legal/text.ts";
import { terminos } from "../src/content/legal/terminos.ts";
import { campaignConfigSchema } from "../src/server/presale/campaign-config.ts";
import { arg, fail, flag } from "./cli.ts";

const file = arg("file") ?? fail("Falta --file=ruta/al/archivo.json");
const raw = JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8"));
const parsed = campaignConfigSchema.safeParse(raw);
if (!parsed.success) fail(`Campaña no válida:\n${parsed.error.issues.map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n")}`);
const campaign = parsed.data;

const termsFile = arg("terms");
if (termsFile && flag("terms-legal")) fail("Usa --terms=archivo o --terms-legal, no ambos.");
const termsContent = flag("terms-legal")
  ? renderLegalText(terminos)
  : termsFile
    ? (await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), termsFile), "utf8")).trim()
    : null;
if (termsFile && !termsContent) fail("El archivo de términos está vacío.");

const summary = `${campaign.slug} · ${campaign.productName} · ${campaign.status}\n  ${campaign.startsAt.toISOString()} → ${campaign.endsAt.toISOString()}\n  ${campaign.unitAmount} ${campaign.currency} (centavos) · ${campaign.questions?.length ?? 0} preguntas · ${campaign.totalUnits ?? "sin tope de"} unidades`;
if (flag("dry-run")) {
  console.log(`Válida (sin guardar):\n  ${summary}`);
  process.exit(0);
}

const db = createDatabase();
const existing = await getCampaignBySlug(db, campaign.slug);
if (existing) {
  const reservations = await listReservations(db, existing.id);
  const priceChanged = existing.unitAmount !== campaign.unitAmount || existing.currency !== campaign.currency;
  if (reservations.length && priceChanged && !flag("force")) {
    fail(`La campaña ya tiene ${reservations.length} reservas: cambiar el precio no afecta las existentes. Repite con --force si es intencional.`);
  }
}
const currentTerms = existing ? await getCurrentTerms(db, existing.id) : null;
if (campaign.status === "active" && !currentTerms && !termsContent) {
  fail("Una campaña activa necesita términos: agrega --terms-legal o --terms=archivo.md (o déjala en draft).");
}

const saved = await db.transaction(async (tx) => {
  const row = await upsertCampaign(tx, campaign);
  await logAdminAction(tx, { actorId: null, actorEmail: "cli", action: existing ? "campaign.update" : "campaign.create", targetType: "campaign", targetId: row.id, metadata: { slug: row.slug, status: row.status, unitAmount: row.unitAmount } });
  return row;
});
console.log(`${existing ? "Actualizada" : "Creada"}:\n  ${summary}`);

if (termsContent && termsContent !== currentTerms?.content) {
  const terms = await publishTerms(db, saved.id, termsContent, "cli");
  await logAdminAction(db, { actorId: null, actorEmail: "cli", action: "terms.publish", targetType: "campaign", targetId: saved.id, metadata: { version: terms.version } });
  console.log(`  Términos publicados: versión ${terms.version}`);
} else if (termsContent) {
  console.log(`  Términos sin cambios (versión ${currentTerms?.version}).`);
}
process.exit(0);
