import { createHash } from "node:crypto";
import type { Database } from "@inttimo/database";
import type { ZodError } from "zod";
import type { StoreError, StoreErrorCode } from "../../lib/store/contract.ts";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { ShippingProvider } from "../shipping/provider.ts";
import type { StoreMismatch } from "./settlement.ts";

export type StoreDeps = {
  db: Database;
  gateway: PaymentGateway;
  /** SkyDropX; null = sin credenciales (no se ofrece envío a domicilio). */
  shipping: ShippingProvider | null;
  /** NEXT_PUBLIC_SITE_URL: base de las URLs de regreso de Stripe. */
  siteUrl: string;
  now?: () => Date;
  /** Se llama cuando un pedido queda pagado (correo de confirmación idempotente). */
  onPaid?: (orderId: string) => Promise<unknown>;
  /** Se llama (una vez por pedido) cuando un cobro no coincide con el pedido: aviso al equipo. */
  onMismatch?: (mismatch: StoreMismatch) => Promise<unknown>;
};

export type StoreResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; body: StoreError };

export function ok<T>(data: T, status = 200): StoreResult<T> {
  return { ok: true, status, data };
}

export function fail(status: number, code: StoreErrorCode, message: string, fieldErrors?: Record<string, string[]>): StoreResult<never> {
  return { ok: false, status, body: { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } } };
}

const joinPath = (path: PropertyKey[]) => path.map(String).join(".") || "_";

/** Errores de Zod → fieldErrors. `keyOf` traduce la ruta del error a la clave que pinta la pantalla; `null` = sin campo (solo va al mensaje). */
export function zodFieldErrors(error: ZodError, keyOf: (path: PropertyKey[]) => string | null = joinPath): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = keyOf(issue.path);
    if (key !== null) (result[key] ??= []).push(issue.message);
  }
  return result;
}

export const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function isUniqueViolation(error: unknown): boolean {
  for (let current = error as { code?: string; cause?: unknown } | undefined; current; current = current.cause as typeof current) {
    if (current.code === "23505") return true;
  }
  return false;
}

/** Código de Postgres (p. ej. 23505) del error o de su causa (Drizzle envuelve el error del driver). */
function pgCode(error: unknown): string | null {
  for (let current = error as { code?: unknown; cause?: unknown } | undefined, depth = 0; current && depth < 5; current = current.cause as typeof current, depth++) {
    if (typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) return current.code;
  }
  return null;
}

/**
 * Resumen de un error apto para logs: nombre, código de Postgres y mensaje cortado ANTES de "params:" (Drizzle incluye
 * ahí los valores de la consulta: nombre, correo, dirección). Nunca incluye la causa completa ni el stack.
 */
export function errorSummary(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = (error instanceof Error ? error.message : String(error)).split(/\bparams:/i)[0]!.trim();
  const code = pgCode(error);
  return `${name}${code ? ` [${code}]` : ""}: ${message}`;
}

/** Resumen del error sin parámetros de consulta ni correos (privacidad), recortado, para registrarlo o guardarlo. */
export function redactError(error: unknown): string {
  return errorSummary(error).replace(/[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, "[correo]").slice(0, 300);
}
