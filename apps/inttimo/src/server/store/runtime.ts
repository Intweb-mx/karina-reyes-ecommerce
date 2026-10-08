import "server-only";
import { getDb, getPaymentGateway, getShippingProvider } from "../presale/runtime.ts";
import type { StoreDeps } from "./common.ts";

export { clientIp } from "../presale/runtime.ts";

/** Dependencias reales de la tienda (misma base, Stripe y SkyDropX que la preventa). */
export function getStoreDeps(): StoreDeps {
  return {
    db: getDb(),
    gateway: getPaymentGateway(),
    shipping: getShippingProvider(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  };
}
