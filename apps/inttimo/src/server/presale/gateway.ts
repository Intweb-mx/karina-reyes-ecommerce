import type { ShippingAddress } from "@inttimo/database";
import Stripe from "stripe";

/** Estado normalizado de una sesión de Checkout; lo usan el webhook, la confirmación y la reconciliación. */
export type CheckoutSnapshot = {
  id: string;
  status: "open" | "complete" | "expired" | "unknown";
  paymentStatus: "paid" | "unpaid" | "no_payment_required" | "unknown";
  /** "store" solo si la sesión trae metadata.kind = "store"; cualquier otra (incluidas las de preventa ya creadas) es "presale". */
  kind: "presale" | "store";
  /** Solo sesiones de preventa. */
  reservationId: string | null;
  /** Solo sesiones de la tienda. */
  storeOrderId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  shippingAddress: ShippingAddress | null;
};

export type CreateCheckoutInput = {
  reservationId: string;
  reservationCode: string;
  campaignSlug: string;
  productName: string;
  unitAmount: number;
  currency: string;
  quantity: number;
  deliveryMethod: "shipping" | "pickup";
  /** Centavos; 0 en recolección. */
  shippingAmount: number;
  /** Texto del cargo de envío en Stripe (p. ej. "Envío · Estafeta Terrestre"). */
  shippingLabel?: string | null;
  email: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

/** Sesión de la tienda: una línea por producto con nombre y precio copiados al pedido (nunca del navegador). */
export type CreateStoreCheckoutInput = {
  orderId: string;
  orderNumber: string;
  currency: string;
  lines: { name: string; unitAmount: number; quantity: number }[];
  deliveryMethod: "shipping" | "pickup";
  /** Centavos; 0 en recolección. */
  shippingAmount: number;
  shippingLabel: string | null;
  email: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<{ id: string; url: string; expiresAt: Date }>;
  createStoreCheckout(input: CreateStoreCheckoutInput): Promise<{ id: string; url: string; expiresAt: Date }>;
  retrieveCheckout(sessionId: string): Promise<CheckoutSnapshot>;
  /** Cierra una sesión abierta que ya no sirve (p. ej. el pedido se cerró antes de ligarla). */
  expireCheckout(sessionId: string): Promise<void>;
}


function known<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | "unknown" {
  return allowed.includes(value as T) ? (value as T) : "unknown";
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function snapshotFromSession(session: Stripe.Checkout.Session): CheckoutSnapshot {
  const shipping = session.collected_information?.shipping_details;
  return {
    id: session.id,
    status: known(session.status, ["open", "complete", "expired"] as const),
    paymentStatus: known(session.payment_status, ["paid", "unpaid", "no_payment_required"] as const),
    kind: session.metadata?.kind === "store" ? "store" : "presale",
    reservationId: session.metadata?.kind === "store" ? null : (session.client_reference_id ?? session.metadata?.reservationId ?? null),
    storeOrderId: session.metadata?.kind === "store" ? (session.client_reference_id ?? session.metadata?.orderId ?? null) : null,
    paymentIntentId: idOf(session.payment_intent),
    amountTotal: session.amount_total,
    currency: session.currency,
    shippingAddress: shipping
      ? {
          name: shipping.name ?? null,
          line1: shipping.address.line1 ?? null,
          line2: shipping.address.line2 ?? null,
          city: shipping.address.city ?? null,
          state: shipping.address.state ?? null,
          postalCode: shipping.address.postal_code ?? null,
          country: shipping.address.country ?? null,
        }
      : null,
  };
}

export function createStripeGateway(stripe: Stripe): PaymentGateway {
  return {
    async createCheckout(input) {
      const metadata = { reservationId: input.reservationId, reservationCode: input.reservationCode, campaignSlug: input.campaignSlug, deliveryMethod: input.deliveryMethod };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              quantity: input.quantity,
              price_data: {
                currency: input.currency,
                unit_amount: input.unitAmount,
                product_data: { name: `Preventa · ${input.productName}` },
              },
            },
          ],
          customer_email: input.email,
          client_reference_id: input.reservationId,
          metadata,
          payment_intent_data: {
            metadata,
            description: `Preventa ${input.productName} (${input.reservationCode}) · ${input.deliveryMethod === "pickup" ? "Recolección en Chihuahua" : "Envío a domicilio"}`,
          },
          // La dirección y la tarifa se eligen en el checkout de inttimo (antes de Stripe); aquí solo se cobra.
          ...(input.shippingAmount > 0
            ? {
                shipping_options: [
                  {
                    shipping_rate_data: {
                      type: "fixed_amount" as const,
                      display_name: input.shippingLabel ?? "Envío a domicilio",
                      fixed_amount: { amount: input.shippingAmount, currency: input.currency },
                    },
                  },
                ],
              }
            : {}),
          locale: "es-419",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        },
        // Reintentos de red con la misma reserva nunca crean dos sesiones.
        { idempotencyKey: `presale-checkout-${input.reservationId}` },
      );
      if (!session.url) throw new Error("Stripe no devolvió la URL de Checkout.");
      return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
    },

    async createStoreCheckout(input) {
      const metadata = { kind: "store", orderId: input.orderId, orderNumber: input.orderNumber, deliveryMethod: input.deliveryMethod };
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: input.lines.map((line) => ({
            quantity: line.quantity,
            price_data: { currency: input.currency, unit_amount: line.unitAmount, product_data: { name: line.name } },
          })),
          customer_email: input.email,
          client_reference_id: input.orderId,
          metadata,
          payment_intent_data: {
            metadata,
            description: `Pedido inttimo ${input.orderNumber} · ${input.deliveryMethod === "pickup" ? "Recolección en Chihuahua" : "Envío a domicilio"}`,
          },
          // Dirección y tarifa se eligen en el checkout de inttimo (antes de Stripe); aquí solo se cobra.
          ...(input.shippingAmount > 0
            ? {
                shipping_options: [
                  {
                    shipping_rate_data: {
                      type: "fixed_amount" as const,
                      display_name: input.shippingLabel ?? "Envío a domicilio",
                      fixed_amount: { amount: input.shippingAmount, currency: input.currency },
                    },
                  },
                ],
              }
            : {}),
          locale: "es-419",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        },
        // Reintentos de red con el mismo pedido nunca crean dos sesiones.
        { idempotencyKey: `store-checkout-${input.orderId}` },
      );
      if (!session.url) throw new Error("Stripe no devolvió la URL de Checkout.");
      return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
    },

    async retrieveCheckout(sessionId) {
      return snapshotFromSession(await stripe.checkout.sessions.retrieve(sessionId));
    },

    async expireCheckout(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },
  };
}
