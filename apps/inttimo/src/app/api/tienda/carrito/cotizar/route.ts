import { quoteCart } from "@/server/store/catalog";
import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

const MAX_BODY_BYTES = 16_000;

/** Precios y totales del carrito calculados en el servidor (CartQuoteResponse). */
export async function POST(request: Request) {
  return storeRoute("store_cart_quote", async () => storeResponse(await quoteCart(getStoreDeps(), await readJson(request, MAX_BODY_BYTES))));
}
