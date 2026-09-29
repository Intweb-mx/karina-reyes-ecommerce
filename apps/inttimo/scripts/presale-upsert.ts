/**
 * Crea o actualiza una campaña de preventa desde un JSON (por slug).
 *
 *   pnpm presale:upsert --file=docs/preventa/campaign.example.json
 *   pnpm presale:upsert --file=... --dry-run      # solo valida
 *
 * Si el JSON no trae endsAt, el cierre es startsAt + durationDays (14 por defecto).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase, getCampaignBySlug, listReservations, upsertCampaign } from "@inttimo/database";
import { campaignConfigSchema } from "../src/server/presale/campaign-config.ts";
import { arg, fail, flag } from "./cli.ts";

const file = arg("file") ?? fail("Falta --file=ruta/al/archivo.json");
const raw = JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8"));
const parsed = campaignConfigSchema.safeParse(raw);
if (!parsed.success) fail(`Campaña no válida:\n${parsed.error.issues.map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n")}`);
const campaign = parsed.data;

const summary = `${campaign.slug} · ${campaign.productName} · ${campaign.status}\n  ${campaign.startsAt.toISOString()} → ${campaign.endsAt.toISOString()}\n  ${campaign.unitAmount} ${campaign.currency} (centavos) · ${campaign.questions?.length ?? 0} preguntas`;
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
await upsertCampaign(db, campaign);
console.log(`${existing ? "Actualizada" : "Creada"}:\n  ${summary}`);
process.exit(0);
