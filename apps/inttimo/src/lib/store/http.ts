/*
 * Adaptador HTTP: implementa StoreApi contra los endpoints solicitados en docs/store/BACKEND-REQUEST.md.
 * Funciona en navegador (rutas relativas) y en servidor (NEXT_PUBLIC_SITE_URL como base).
 */
import type { Result, StoreApi } from "./api";
import type { StoreError } from "./contract";

function base(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
}

async function call<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<Result<T>> {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init?.body) headers["content-type"] = "application/json";
    if (init?.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
    const response = await fetch(`${base()}/api/tienda${path}`, { ...init, headers, cache: "no-store", credentials: "same-origin" });
    const data = (await response.json()) as T | StoreError;
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, ...(data as StoreError) };
  } catch {
    return { ok: false, error: { code: "service_unavailable", message: "No pudimos conectar con la tienda. Inténtalo de nuevo en un momento." } };
  }
}

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const httpStoreApi: StoreApi = {
  mode: "http",
  catalog: () => call("/productos"),
  product: (slug) => call(`/productos/${encodeURIComponent(slug)}`),
  quoteCart: (request) => call("/carrito/cotizar", post(request)),
  deliveryOptions: () => call("/entrega"),
  quoteShipping: (request) => call("/envio/cotizar", post(request)),
  checkout: (request, idempotencyKey) => call("/checkout", { ...post(request), idempotencyKey }),
  orderConfirmation: (sessionId) => call(`/pedido/confirmacion?session_id=${encodeURIComponent(sessionId)}`),
  trackOrder: (request) => call("/rastrear", post(request)),
  requestAccountAccess: (request) => call("/cuenta/acceso", post(request)),
  account: () => call("/cuenta"),
  contact: (request) => call("/contacto", post(request)),
  churchQuote: (request) => call("/iglesias/cotizacion", post(request)),
  newsletter: (request) => call("/newsletter", post(request)),
};
