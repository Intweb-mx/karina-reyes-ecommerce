import type { ApiError } from "@/server/presale/contract";
import { ConfigError, confirmPaid, getDb, getStripe, getWebhookSecret, handle } from "@/server/presale/runtime";
import { handleStripeEvent } from "@/server/presale/webhook";
import { confirmStorePaid, notifyStoreMismatch } from "@/server/store/runtime";
import type Stripe from "stripe";

/**
 * Mismo endpoint para la preventa y la tienda (las sesiones de la tienda traen metadata.kind = "store").
 * No se oculta con la tienda: los pagos y reembolsos de pedidos existentes siempre se registran.
 * Configurar en Stripe → Webhooks con los eventos:
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired, charge.refunded.
 */
export async function POST(request: Request) {
  return handle("stripe_webhook", async () => {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    let event: Stripe.Event;
    try {
      if (!signature) throw new Error("missing signature");
      event = getStripe().webhooks.constructEvent(payload, signature, getWebhookSecret());
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      const body: ApiError = { error: { code: "invalid_signature", message: "Firma no válida." } };
      return Response.json(body, { status: 400 });
    }

    const outcome = await handleStripeEvent(getDb(), event);
    if ("reservationId" in outcome && outcome.status === "paid") await confirmPaid(outcome.reservationId);
    if ("storeOrderId" in outcome && outcome.paymentStatus === "paid") await confirmStorePaid(outcome.storeOrderId);
    if ("storeOrderId" in outcome && outcome.mismatch) await notifyStoreMismatch(outcome.mismatch);
    return Response.json({ received: true, result: outcome.result });
  });
}
