import { addAdminOrderNote } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { readJson, storeResponse } from "@/server/store/http";

/** Nota interna del pedido: el cliente nunca la ve y no se puede editar ni borrar. */
export async function POST(request: Request, ctx: RouteContext<"/api/panel/tienda/pedidos/[folio]/notas">) {
  return adminRoute("store_admin_order_note", request, async (actor) =>
    storeResponse(await addAdminOrderNote(getStoreAdminDeps(), (await ctx.params).folio, await readJson(request, 8_000), actor)),
  );
}
