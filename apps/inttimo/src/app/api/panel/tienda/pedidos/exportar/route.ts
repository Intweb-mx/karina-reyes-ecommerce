import { exportAdminOrders, parseOrdersQuery } from "@/server/store/admin";
import { adminRoute, getStoreAdminDeps } from "@/server/store/admin-http";

/** CSV de pedidos con el filtro actual. Descargar datos personales queda en la bitácora. */
export async function GET(request: Request) {
  return adminRoute("store_admin_orders_export", request, async (actor) => {
    const query = parseOrdersQuery(new URL(request.url).searchParams);
    const { csv, rows } = await exportAdminOrders(getStoreAdminDeps(), query);
    await actor.audit({ action: "store_orders.export", targetType: "store_order", metadata: { rows, filter: query.filter, search: !!query.search } });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pedidos-tienda-${query.filter}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  });
}
