import "server-only";
import { sendMail } from "@inttimo/shared-utils/mail";
import { getDb, getPaymentGateway, getShippingProvider } from "../presale/runtime.ts";
import type { StoreDeps } from "./common.ts";
import { sendStoreConfirmationIfNeeded } from "./notifications.ts";

export { clientIp } from "../presale/runtime.ts";

/** Correo del equipo para avisos de la tienda; si falta, el de la preventa. */
export function storeNotifyEmail(): string | null {
  return process.env.STORE_NOTIFY_EMAIL || process.env.PRESALE_NOTIFY_EMAIL || null;
}

/** Correo de pedido pagado (idempotente): lo llaman el webhook y la confirmación. */
export function confirmStorePaid(orderId: string) {
  return sendStoreConfirmationIfNeeded(getDb(), orderId, { send: sendMail, notifyEmail: storeNotifyEmail() });
}

/** Dependencias reales de la tienda (misma base, Stripe y SkyDropX que la preventa). */
export function getStoreDeps(): StoreDeps {
  return {
    db: getDb(),
    gateway: getPaymentGateway(),
    shipping: getShippingProvider(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    onPaid: confirmStorePaid,
  };
}
