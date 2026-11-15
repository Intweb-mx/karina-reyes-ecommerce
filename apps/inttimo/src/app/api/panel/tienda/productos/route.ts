import { listAdminProducts } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { storeResponse } from "@/server/store/http";

/** Productos de la tienda con su inventario. */
export async function GET(request: Request) {
  return adminRoute("store_admin_products", request, async () => storeResponse(await listAdminProducts(getStoreAdminDeps())));
}
