import { getProduct } from "@/server/store/catalog";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Detalle de producto (ProductDetail); 404 si no está publicado. */
export async function GET(_request: Request, ctx: RouteContext<"/api/tienda/productos/[slug]">) {
  return storeRoute("store_product", async () => {
    const { slug } = await ctx.params;
    return storeResponse(await getProduct(getStoreDeps(), slug));
  });
}
