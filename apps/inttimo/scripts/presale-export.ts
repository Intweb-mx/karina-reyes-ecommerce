/**
 * Exporta las reservas de una campaña a CSV (stdout).
 *
 *   pnpm presale:export --slug=uno-mas-uno > reservas.csv
 *   pnpm presale:export --slug=uno-mas-uno --status=paid,processing > pagadas.csv
 */
import { createDatabase, getCampaignBySlug, listReservations, type ReservationStatus } from "@inttimo/database";
import { arg, fail } from "./cli.ts";

const slug = arg("slug") ?? fail("Falta --slug=...");
const statuses = arg("status")?.split(",").filter(Boolean) as ReservationStatus[] | undefined;

const db = createDatabase();
const campaign = (await getCampaignBySlug(db, slug)) ?? fail(`No existe la campaña ${slug}.`);
const rows = await listReservations(db, campaign.id, statuses);

const questionIds = campaign.questions.map((q) => q.id);
const escape = (value: unknown) => {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel / Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

const header = [
  "folio", "estado", "nombre", "email", "telefono", "cantidad", "total_centavos", "moneda", "reembolsado_centavos",
  "pagada_en", "creada_en", "acepta_marketing",
  "envio_nombre", "envio_calle", "envio_calle2", "envio_ciudad", "envio_estado", "envio_cp", "envio_pais",
  ...questionIds.map((id) => `respuesta_${id}`),
];
const lines = rows.map((r) =>
  [
    r.code, r.status, r.fullName, r.email, r.phone, r.quantity, r.totalAmount, r.currency, r.amountRefunded,
    r.paidAt?.toISOString(), r.createdAt.toISOString(), r.marketingConsent ? "si" : "no",
    r.shippingAddress?.name, r.shippingAddress?.line1, r.shippingAddress?.line2, r.shippingAddress?.city,
    r.shippingAddress?.state, r.shippingAddress?.postalCode, r.shippingAddress?.country,
    ...questionIds.map((id) => r.answers[id]),
  ]
    .map(escape)
    .join(","),
);

process.stdout.write(`﻿${[header.map(escape).join(","), ...lines].join("\n")}\n`);
console.error(`${rows.length} reservas exportadas.`);
process.exit(0);
