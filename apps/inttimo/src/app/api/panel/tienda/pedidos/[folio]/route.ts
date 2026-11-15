import { getAdminOrder } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { storeResponse } from "@/server/store/http";

/** Detalle de un pedido de la tienda, con las acciones que caben en su estado. */
export async function GET(request: Request, ctx: RouteContext<"/api/panel/tienda/pedidos/[folio]">) {
  return adminRoute("store_admin_order", request, async (actor) => storeResponse(await getAdminOrder(getStoreAdminDeps(), (await ctx.params).folio, actor)));
}
