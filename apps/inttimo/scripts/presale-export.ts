/**
 * Exporta las reservas de una campaña a CSV (stdout).
 *
 *   pnpm presale:export --slug=uno-mas-uno > reservas.csv
 *   pnpm presale:export --slug=uno-mas-uno --status=paid,processing > pagadas.csv
 */
import { createDatabase, getCampaignBySlug, listReservations, logAdminAction, type ReservationStatus } from "@inttimo/database";
import { buildReservationsCsv } from "../src/server/presale/export.ts";
import { arg, fail } from "./cli.ts";

const slug = arg("slug") ?? fail("Falta --slug=...");
const statuses = arg("status")?.split(",").filter(Boolean) as ReservationStatus[] | undefined;

const db = createDatabase();
const campaign = (await getCampaignBySlug(db, slug)) ?? fail(`No existe la campaña ${slug}.`);
const rows = await listReservations(db, campaign.id, statuses);
await logAdminAction(db, { actorId: null, actorEmail: "cli", action: "reservations.export", targetType: "campaign", targetId: campaign.id, metadata: { rows: rows.length, statuses: statuses ?? "all" } });

process.stdout.write(buildReservationsCsv(campaign, rows));
console.error(`${rows.length} reservas exportadas.`);
process.exit(0);
