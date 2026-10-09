import { storeResponse, storeRoute } from "@/server/store/http";
import { lookupPostalCode } from "@/server/store/postal-code";

/** Estado, municipio y colonias por código postal (hoy siempre 404: sin catálogo conectado). */
export async function GET(_request: Request, ctx: RouteContext<"/api/tienda/codigo-postal/[cp]">) {
  return storeRoute("store_postal_code", async () => {
    const { cp } = await ctx.params;
    return storeResponse(await lookupPostalCode(cp));
  });
}
