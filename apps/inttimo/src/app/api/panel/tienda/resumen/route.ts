import { getAdminDashboard } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";
import { storeResponse } from "@/server/store/http";

/** Resumen del panel de la tienda: ?periodo=7d|30d|all. */
export async function GET(request: Request) {
  return adminRoute("store_admin_dashboard", request, async () => storeResponse(await getAdminDashboard(getStoreAdminDeps(), new URL(request.url).searchParams.get("periodo"))));
}
