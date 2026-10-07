import type { Tone } from "@/app/panel/ui";
import type { AdminLeadStatus, AdminOrderAction, AdminOrderFilter, StockMovement } from "@/lib/store/admin-contract";
import type { FulfillmentStatus, PaymentStatus } from "@/lib/store/contract";

/** Textos del panel de la tienda: lenguaje simple, pensado para quien opera, no para quien programa. */
export const FILTERS: { id: AdminOrderFilter; label: string }[] = [
  { id: "to_ship", label: "Por enviar" },
  { id: "to_pickup", label: "Por preparar (recoger)" },
  { id: "in_transit", label: "En camino / por recoger" },
  { id: "exception", label: "Con incidencia" },
  { id: "delivered", label: "Entregados" },
  { id: "unpaid", label: "Sin pagar" },
  { id: "all", label: "Todos" },
];

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  confirmed: "Por preparar",
  preparing: "En preparación",
  label_generated: "Guía lista, por entregar a paquetería",
  ready_for_pickup: "Listo para recoger",
  handed_to_carrier: "Con la paquetería",
  in_transit: "En tránsito",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  exception: "Incidencia",
};

export const FULFILLMENT_TONE: Record<FulfillmentStatus, Tone> = {
  confirmed: "attention",
  preparing: "attention",
  label_generated: "attention",
  ready_for_pickup: "info",
  handed_to_carrier: "info",
  in_transit: "info",
  out_for_delivery: "info",
  delivered: "good",
  exception: "bad",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Sin pagar",
  authorized: "Pago autorizado",
  paid: "Pagado",
  failed: "Pago rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
};

export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  pending: "neutral",
  authorized: "info",
  paid: "good",
  failed: "bad",
  cancelled: "neutral",
  refunded: "neutral",
  partially_refunded: "attention",
};

/** Acciones del pedido. `primary`: el siguiente paso natural; `confirm`: pide confirmación (y nota opcional). */
export const ACTIONS: Record<AdminOrderAction, { label: string; help: string; primary?: boolean; confirm?: string; danger?: boolean }> = {
  generate_label: { label: "Generar guía", help: "Compra la guía con la paquetería elegida por el cliente y la deja lista para imprimir.", primary: true },
  mark_shipped: { label: "Marcar como enviado", help: "Cuando entregues el paquete a la paquetería. El cliente recibe su número de guía.", primary: true },
  mark_ready_for_pickup: { label: "Avisar que está listo", help: "Le enviamos un correo al cliente para que pase a recoger.", primary: true },
  mark_delivered: { label: "Marcar como entregado", help: "Cuando el cliente ya tiene su pedido.", primary: true },
  report_exception: { label: "Reportar incidencia", help: "Paquete detenido, dirección incorrecta, daño… Queda registrado en el pedido.", confirm: "¿Qué pasó? Esta nota se guarda en el pedido (el cliente no la ve)." },
  resend_confirmation: { label: "Reenviar correo de confirmación", help: "Útil si el cliente no encuentra su correo." },
  cancel: { label: "Cancelar pedido", help: "Si ya se pagó, se reembolsa el total en Stripe. No se puede deshacer.", confirm: "Esto cancela el pedido y, si está pagado, reembolsa el total. No se puede deshacer.", danger: true },
};

export const LEAD_STATUS: Record<AdminLeadStatus, { label: string; tone: Tone }> = {
  new: { label: "Nueva", tone: "attention" },
  contacted: { label: "Contactada", tone: "info" },
  quoted: { label: "Cotización enviada", tone: "info" },
  won: { label: "Cerrada con venta", tone: "good" },
  closed: { label: "Cerrada", tone: "neutral" },
};

export const MOVEMENT_REASON: Record<StockMovement["reason"], string> = {
  reception: "Recepción de mercancía",
  adjustment: "Ajuste manual",
  damage: "Merma o daño",
  return: "Devolución",
  correction: "Corrección de conteo",
  sale: "Venta",
  reservation: "Apartado en checkout",
  release: "Apartado liberado",
};

export const dateTime = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });
