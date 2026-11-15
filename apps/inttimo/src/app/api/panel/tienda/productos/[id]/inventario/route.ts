import { adjustAdminStock } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { readJson, storeResponse } from "@/server/store/http";

/** Entrada o salida de inventario con motivo: queda como movimiento auditable. */
export async function POST(request: Request, ctx: RouteContext<"/api/panel/tienda/productos/[id]/inventario">) {
  return adminRoute("store_admin_stock", request, async (actor) =>
    storeResponse(await adjustAdminStock(getStoreAdminDeps(), (await ctx.params).id, await readJson(request, 4_000), actor)),
  );
}
