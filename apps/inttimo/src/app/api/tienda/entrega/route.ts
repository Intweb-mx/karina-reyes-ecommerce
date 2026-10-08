import { storeResponse, storeRoute } from "@/server/store/http";
import { getStoreDeps } from "@/server/store/runtime";
import { getDeliveryOptions } from "@/server/store/shipping";

/** Métodos de entrega activos, puntos de recolección y versión vigente de los Términos (DeliveryOptionsResponse). */
export async function GET() {
  return storeRoute("store_delivery_options", async () => storeResponse(await getDeliveryOptions(getStoreDeps())));
}
