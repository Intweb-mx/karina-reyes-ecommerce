/**
 * Contrato entre el backend del panel (`server/admin/*`) y sus pantallas (`app/panel/**`).
 * Solo tipos y constantes: se puede importar desde componentes de cliente. Las pantallas no consultan la base directamente.
 */
import type { DeliveryMethod, FulfillmentStatus, ReservationStatus } from "@inttimo/database";

/** El único paso que toca hacer con un pedido. Lo decide el servidor (`nextStepFor`). */
export type NextStep =
  | { type: "not_paid" }
  /** `blocked`: sin dirección no se puede comprar la guía. `inProgress`: SkyDropX aún no devuelve el número de guía. */
  | { type: "generate_label"; blocked: "missing_address" | null; inProgress: boolean }
  | { type: "hand_to_carrier" }
  | { type: "mark_delivered" }
  | { type: "notify_ready" }
  | { type: "mark_picked_up" }
  | { type: "none" };

export type IncidentType = "label_failed" | "confirmation_email_failed" | "fulfillment_email_failed" | "bonus_failed" | "payment_unsettled" | "missing_address";

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  label_failed: "No se pudo generar la guía",
  confirmation_email_failed: "No le llegó el correo de confirmación",
  fulfillment_email_failed: "No le llegó el aviso de envío o recolección",
  bonus_failed: "No le llegó el bonus",
  payment_unsettled: "Pago sin confirmar desde hace más de un día",
  missing_address: "Falta la dirección de envío",
};

export const ORDER_TABS = ["to_prepare", "in_transit", "delivered", "canceled", "all"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const ORDER_TAB_LABELS: Record<OrderTab, string> = {
  to_prepare: "Por preparar",
  in_transit: "Enviados o listos",
  delivered: "Entregados",
  canceled: "Cancelados y reembolsados",
  all: "Todos",
};

export type OrderSummary = {
  id: string;
  code: string;
  fullName: string;
  email: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  status: ReservationStatus;
  deliveryMethod: DeliveryMethod;
  fulfillmentStatus: FulfillmentStatus;
  campaignName: string;
  createdAt: Date;
  paidAt: Date | null;
};

export type Inbox = {
  toLabel: OrderSummary[];
  toHandOver: OrderSummary[];
  toNotify: OrderSummary[];
  awaitingPickup: (OrderSummary & { waitingDays: number })[];
  incidents: (OrderSummary & { incident: IncidentType })[];
};

export type OrderQuery = { q?: string; tab: OrderTab; deliveryMethod?: DeliveryMethod; campaignId?: string; page: number };

export type OrderList = {
  rows: OrderSummary[];
  total: number;
  counts: Record<OrderTab, number>;
  page: number;
  pages: number;
  campaigns: { id: string; slug: string; productName: string }[];
};

export type AnswerRow = { label: string; value: string };

export type OrderDetail = {
  id: string;
  code: string;
  campaign: { slug: string; productName: string } | null;
  customer: { fullName: string; email: string; phone: string | null; marketingConsent: boolean };
  payment: {
    status: ReservationStatus;
    quantity: number;
    unitAmount: number;
    shippingAmount: number;
    totalAmount: number;
    amountRefunded: number;
    currency: string;
    createdAt: Date;
    paidAt: Date | null;
    termsVersion: number | null;
    stripeUrl: string | null;
  };
  delivery: {
    method: DeliveryMethod;
    status: FulfillmentStatus;
    pickupPoint: { name: string; schedule: string } | null;
    /** Líneas listas para mostrar; null si no hay dirección. */
    address: string[] | null;
    /** Paquetería que eligió el cliente, p. ej. "Estafeta Terrestre · 5 días". */
    selection: string | null;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    labelUrl: string | null;
    fulfilledAt: Date | null;
    deliveredAt: Date | null;
  };
  bonus: { configured: boolean; sentAt: Date | null };
  nextStep: NextStep;
  incidents: IncidentType[];
  answers: AnswerRow[];
  postPurchase: AnswerRow[] | null;
  notes: { id: string; body: string; authorEmail: string; createdAt: Date }[];
  /** `type` es el tipo de evento; la pantalla lo traduce con EVENT_LABELS. */
  timeline: { id: string; at: Date; type: string; failed: boolean }[];
};
