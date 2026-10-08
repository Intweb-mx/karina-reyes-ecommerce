import type { StoreError } from "../../lib/store/contract.ts";
import { storeEnabled } from "../../lib/store/flags.ts";
import type { StoreResult } from "./common.ts";

const NO_STORE = { "cache-control": "no-store" };

export function storeResponse<T>(result: StoreResult<T>): Response {
  return Response.json(result.ok ? result.data : result.body, { status: result.status, headers: NO_STORE });
}

/** JSON del cuerpo; null si excede `maxBytes` o no es JSON (el servicio responde validation_error). */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Envoltura de cada ruta /api/tienda/*. Con la tienda oculta (src/lib/store/flags.ts) responde 404 como si no existiera:
 * nada de la tienda (ni el checkout, que crea pedidos y sesiones de Stripe) es alcanzable en producción antes del
 * lanzamiento. Un error inesperado responde 503 genérico con log estructurado, nunca un falso éxito.
 */
export async function storeRoute(name: string, run: () => Promise<Response>, enabled: boolean = storeEnabled): Promise<Response> {
  if (!enabled) {
    const body: StoreError = { error: { code: "not_found", message: "No encontrado." } };
    return Response.json(body, { status: 404, headers: NO_STORE });
  }
  try {
    return await run();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: `${name}_failed`, error: String(error).slice(0, 500) }));
    const body: StoreError = { error: { code: "service_unavailable", message: "La tienda no está disponible por el momento. Inténtalo de nuevo en unos minutos." } };
    return Response.json(body, { status: 503, headers: NO_STORE });
  }
}
