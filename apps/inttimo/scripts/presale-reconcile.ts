/**
 * Sincroniza con Stripe las reservas sin resolver y reintenta correos pendientes.
 *
 *   pnpm presale:reconcile                     # reservas con más de 15 min
 *   pnpm presale:reconcile --older-than=60     # minutos
 */
import { createDatabase } from "@inttimo/database";
import { sendMail } from "@inttimo/shared-utils/mail";
import Stripe from "stripe";
import { createStripeGateway } from "../src/server/presale/gateway.ts";
import { reconcilePresale } from "../src/server/presale/reconcile.ts";
import { arg, fail } from "./cli.ts";

const minutes = Number(arg("older-than") ?? 15);
if (!Number.isFinite(minutes) || minutes < 0) fail("--older-than debe ser un número de minutos.");
const key = process.env.STRIPE_SECRET_KEY ?? fail("STRIPE_SECRET_KEY no está configurada.");

const report = await reconcilePresale(
  { db: createDatabase(), gateway: createStripeGateway(new Stripe(key)), send: sendMail, notifyEmail: process.env.PRESALE_NOTIFY_EMAIL || null },
  { olderThan: new Date(Date.now() - minutes * 60_000) },
);

console.log(`Revisadas: ${report.checked} · Actualizadas: ${report.updated.length} · Correos enviados: ${report.emails.sent} · Correos fallidos: ${report.emails.failed}`);
for (const item of report.updated) console.log(`  ${item.code} → ${item.status}`);
for (const error of report.errors) console.error(`  Error ${error}`);
process.exit(report.errors.length || report.emails.failed ? 1 : 0);
