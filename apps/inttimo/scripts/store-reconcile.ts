/**
 * Red de seguridad de la tienda: sincroniza con Stripe los pedidos pendientes, libera en bloque los apartados vencidos y
 * reintenta los correos de pedido pagado.
 *
 *   pnpm store:reconcile                     # pedidos con más de 15 min
 *   pnpm store:reconcile --older-than=60     # minutos
 */
import { createDatabase } from "@inttimo/database";
import { sendMail } from "@inttimo/shared-utils/mail";
import Stripe from "stripe";
import { createStripeGateway } from "../src/server/presale/gateway.ts";
import { reconcileStore } from "../src/server/store/reconcile.ts";
import { arg, fail } from "./cli.ts";

const minutes = Number(arg("older-than") ?? 15);
if (!Number.isFinite(minutes) || minutes < 0) fail("--older-than debe ser un número de minutos.");
const key = process.env.STRIPE_SECRET_KEY ?? fail("STRIPE_SECRET_KEY no está configurada.");

const report = await reconcileStore(
  {
    db: createDatabase(),
    gateway: createStripeGateway(new Stripe(key)),
    send: sendMail,
    notifyEmail: process.env.STORE_NOTIFY_EMAIL || process.env.PRESALE_NOTIFY_EMAIL || null,
  },
  { olderThan: new Date(Date.now() - minutes * 60_000) },
);

console.log(
  `Revisados: ${report.checked} · Actualizados: ${report.updated.length} · Liberados: ${report.released} · Correos enviados: ${report.emails.sent} · Fallidos: ${report.emails.failed} · Incidencias avisadas: ${report.emails.exceptions}`,
);
for (const item of report.updated) console.log(`  ${item.orderNumber} → ${item.paymentStatus}`);
for (const error of report.errors) console.error(`  Error ${error}`);
process.exit(report.errors.length || report.emails.failed ? 1 : 0);
