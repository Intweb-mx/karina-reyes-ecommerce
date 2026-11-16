import "server-only";
import { sendMail } from "@inttimo/shared-utils/mail";
import type { StoreError } from "../../lib/store/contract.ts";
import { audit, getAdminState } from "../auth/admin.ts";
import { getDb, getPaymentGateway, getShippingProvider } from "../presale/runtime.ts";
import type { StoreAdminActor, StoreAdminDeps } from "./admin.ts";
import { redactError } from "./common.ts";

const NO_STORE = { "cache-control": "private, no-store" };
const json = (status: number, code: StoreError["error"]["code"], message: string) => Response.json({ error: { code, message } } satisfies StoreError, { status, headers: NO_STORE });

export function getStoreAdminDeps(): StoreAdminDeps {
  return { db: getDb(), gateway: getPaymentGateway(), shipping: getShippingProvider(), send: sendMail };
}

/** Una petición que cambia datos debe venir del propio sitio (además de la cookie de sesión, que es SameSite). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

/**
 * Envoltura de cada ruta /api/panel/tienda/*: solo administradores con sesión válida del panel (misma regla que las
 * páginas del panel), origen propio en las peticiones que cambian datos y 503 genérico con log si algo inesperado falla.
 */
export async function adminRoute(name: string, request: Request, run: (actor: StoreAdminActor) => Promise<Response>): Promise<Response> {
  try {
    const state = await getAdminState();
    if (state.status !== "ok") return json(401, "not_found", "Sesión vencida. Vuelve a entrar al panel.");
    if (request.method !== "GET" && !sameOrigin(request)) return json(403, "validation_error", "Petición no permitida.");
    const admin = state.admin;
    return await run({ email: admin.email, audit: (entry) => audit(admin, entry) });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: `${name}_failed`, error: redactError(error) }));
    return json(503, "service_unavailable", "El panel no está disponible por el momento. Inténtalo de nuevo en unos minutos.");
  }
}
