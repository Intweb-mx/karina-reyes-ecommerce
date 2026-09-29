import "server-only";
import { createDatabase, type Database } from "@inttimo/database";
import { sendMail } from "@inttimo/shared-utils/mail";
import Stripe from "stripe";
import type { ApiError } from "./contract.ts";
import { createStripeGateway, type PaymentGateway } from "./gateway.ts";
import { sendConfirmationIfNeeded } from "./notifications.ts";
import type { PresaleDeps, ServiceResult } from "./reservations.ts";

// En globalThis: la recarga en caliente de `next dev` reevalúa este módulo y sin esto abriría un pool nuevo en cada cambio.
const cache = globalThis as typeof globalThis & { __inttimoDb?: Database };
let stripe: Stripe | undefined;

export class ConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`${name} no está configurada.`);
  return value;
}

export function getDb(): Database {
  return (cache.__inttimoDb ??= createDatabase());
}

export function getStripe(): Stripe {
  return (stripe ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"), { maxNetworkRetries: 2, timeout: 20_000 }));
}

export function getWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function confirmPaid(reservationId: string) {
  return sendConfirmationIfNeeded(getDb(), reservationId, { send: sendMail, notifyEmail: process.env.PRESALE_NOTIFY_EMAIL || null });
}

/** Stripe se inicializa al usarse: sin llave, la validación y las consultas siguen funcionando. */
const lazyGateway: PaymentGateway = {
  createCheckout: (input) => createStripeGateway(getStripe()).createCheckout(input),
  retrieveCheckout: (sessionId) => createStripeGateway(getStripe()).retrieveCheckout(sessionId),
};

export function getPresaleDeps(): PresaleDeps {
  return {
    db: getDb(),
    gateway: lazyGateway,
    siteUrl: requireEnv("NEXT_PUBLIC_SITE_URL"),
    onPaid: confirmPaid,
  };
}

export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

const NO_STORE = { "cache-control": "no-store" };

export function toResponse<T>(result: ServiceResult<T>): Response {
  return Response.json(result.ok ? result.data : result.body, { status: result.status, headers: NO_STORE });
}

/** Errores inesperados (base de datos caída, variables faltantes): 503 genérico y log estructurado, nunca un falso éxito. */
export async function handle(name: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: `${name}_failed`, error: String(error) }));
    const body: ApiError = { error: { code: "service_unavailable", message: "Servicio no disponible por el momento. Inténtalo de nuevo en unos minutos." } };
    return Response.json(body, { status: 503, headers: NO_STORE });
  }
}
