import { createHash } from "node:crypto";
import type { Database } from "@inttimo/database";
import type { ZodError } from "zod";
import type { StoreError, StoreErrorCode } from "../../lib/store/contract.ts";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { ShippingProvider } from "../shipping/provider.ts";

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
};

export type StoreResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; body: StoreError };

export function ok<T>(data: T, status = 200): StoreResult<T> {
  return { ok: true, status, data };
}

export function fail(status: number, code: StoreErrorCode, message: string, fieldErrors?: Record<string, string[]>): StoreResult<never> {
  return { ok: false, status, body: { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } } };
}

const joinPath = (path: PropertyKey[]) => path.map(String).join(".") || "_";

/** Errores de Zod → fieldErrors. `keyOf` traduce la ruta del error a la clave que pinta la pantalla. */
export function zodFieldErrors(error: ZodError, keyOf: (path: PropertyKey[]) => string = joinPath): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[keyOf(issue.path)] ??= []).push(issue.message);
  return result;
}

export const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function isUniqueViolation(error: unknown): boolean {
  for (let current = error as { code?: string; cause?: unknown } | undefined; current; current = current.cause as typeof current) {
    if (current.code === "23505") return true;
  }
  return false;
}
