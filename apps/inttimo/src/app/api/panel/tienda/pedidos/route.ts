import { listAdminOrders, parseOrdersQuery } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { storeResponse } from "@/server/store/http";

/** Pedidos de la tienda: ?filtro=…&q=…&pagina=…. */
export async function GET(request: Request) {
  return adminRoute("store_admin_orders", request, async () => storeResponse(await listAdminOrders(getStoreAdminDeps(), parseOrdersQuery(new URL(request.url).searchParams))));
}
