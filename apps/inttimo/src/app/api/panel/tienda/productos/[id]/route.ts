import { updateAdminProduct } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { readJson, storeResponse } from "@/server/store/http";

/** Edita precio (centavos), publicación, aviso de poco inventario y máximo por pedido. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/panel/tienda/productos/[id]">) {
  return adminRoute("store_admin_product_update", request, async (actor) =>
    storeResponse(await updateAdminProduct(getStoreAdminDeps(), (await ctx.params).id, await readJson(request, 4_000), actor)),
  );
}
