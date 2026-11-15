import { listAdminStockMovements } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { storeResponse } from "@/server/store/http";

/** Movimientos de inventario del producto, del más reciente al más antiguo. */
export async function GET(request: Request, ctx: RouteContext<"/api/panel/tienda/productos/[id]/movimientos">) {
  return adminRoute("store_admin_stock_movements", request, async () => storeResponse(await listAdminStockMovements(getStoreAdminDeps(), (await ctx.params).id)));
}
