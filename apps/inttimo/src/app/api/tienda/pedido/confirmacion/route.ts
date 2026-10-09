import type { NextRequest } from "next/server";
import { getOrderConfirmation } from "@/server/store/confirmation";
import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";

/** Pedido al regresar de Stripe (OrderConfirmationResponse). */
export async function GET(request: NextRequest) {
  return storeRoute("store_order_confirmation", async () => storeResponse(await getOrderConfirmation(getStoreDeps(), request.nextUrl.searchParams.get("session_id"))));
}
