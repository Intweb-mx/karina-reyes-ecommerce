import { createStoreCheckout } from "@/server/store/checkout";
import { readJson, storeResponse, storeRoute } from "@/server/store/http";
import { clientIp, getStoreDeps } from "@/server/store/runtime";

const MAX_BODY_BYTES = 32_000;

/** Crea el pedido pendiente y la sesión de Stripe Checkout (cabecera Idempotency-Key). */
export async function POST(request: Request) {
  return storeRoute("store_checkout", async () =>
    storeResponse(
      await createStoreCheckout(getStoreDeps(), {
        body: await readJson(request, MAX_BODY_BYTES),
        idempotencyKey: request.headers.get("idempotency-key"),
        clientIp: clientIp(request),
      }),
    ),
  );
}
