import { runAdminOrderAction } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { readJson, storeResponse } from "@/server/store/http";

// Generar guía y reembolsar esperan a SkyDropX y a Stripe.
export const maxDuration = 60;

/**
 * Acción sobre un pedido (generar guía, enviado, listo para recoger, entregado, incidencia, reenviar correo, cancelar).
 * No hace falta guardar la cabecera Idempotency-Key: cada acción revisa el estado del pedido en la base y el reembolso
 * usa una clave de idempotencia por pedido, así que repetirla no la aplica dos veces.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/panel/tienda/pedidos/[folio]/acciones">) {
  return adminRoute("store_admin_order_action", request, async (actor) =>
    storeResponse(await runAdminOrderAction(getStoreAdminDeps(), (await ctx.params).folio, await readJson(request, 8_000), actor)),
  );
}
