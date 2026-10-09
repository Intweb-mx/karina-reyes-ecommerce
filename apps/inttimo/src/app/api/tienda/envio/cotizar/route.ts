import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { clientIp, getStoreDeps } from "@/server/store/runtime";
import { quoteStoreShipping } from "@/server/store/shipping";

const MAX_BODY_BYTES = 8_000;

/** Cotización de SkyDropX para el carrito (ShippingQuoteRequest → ShippingQuoteResponse). */
export async function POST(request: Request) {
  return storeRoute("store_shipping_quote", async () =>
    storeResponse(await quoteStoreShipping(getStoreDeps(), { body: await readJson(request, MAX_BODY_BYTES), clientIp: clientIp(request) })),
  );
}
