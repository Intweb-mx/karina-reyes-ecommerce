/** Piezas visuales mínimas del panel interno. */
import type { ReactNode } from "react";

export const inputClass = "mt-1.5 w-full border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-fg";
export const buttonClass = "bg-accent px-4 py-2 text-sm text-bg transition-opacity hover:opacity-90 disabled:opacity-60";
export const secondaryButtonClass = "border border-border bg-surface px-4 py-2 text-sm hover:border-fg";

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border border-border bg-surface p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl tabular-nums">{value}</p>
    </div>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "ok" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`border px-3 py-2 text-sm ${tone === "error" ? "border-danger/40 text-danger" : "border-border"}`}>
      {children}
    </p>
  );
}

export const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pago pendiente",
  processing: "Procesando (OXXO)",
  paid: "Pagada",
  payment_failed: "Pago fallido",
  expired: "Expirada",
  partially_refunded: "Reembolso parcial",
  refunded: "Reembolsada",
  canceled: "Cancelada",
};

export const DELIVERY_LABELS: Record<string, string> = {
  shipping: "Envío a domicilio",
  pickup: "Recolección en Chihuahua",
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  pending: "En preparación",
  ready_for_pickup: "Listo para recoger",
  shipped: "Enviado",
  delivered: "Entregado",
};

export const EVENT_LABELS: Record<string, string> = {
  RESERVATION_CREATED: "Pedido creado",
  CHECKOUT_CREATED: "Cliente pasó a pagar",
  CHECKOUT_CREATE_FAILED: "No se pudo abrir la página de pago",
  CHECKOUT_EXPIRED: "El cliente no terminó de pagar",
  PAYMENT_PROCESSING: "Pago en proceso (OXXO)",
  PAYMENT_APPROVED: "Pago recibido",
  PAYMENT_FAILED: "Pago rechazado",
  CONFIRMATION_EMAIL_SENT: "Correo de confirmación enviado",
  CONFIRMATION_EMAIL_FAILED: "Falló el correo de confirmación",
  LABEL_CREATED: "Guía generada",
  LABEL_FAILED: "No se pudo generar la guía",
  READY_FOR_PICKUP: "Marcado listo para recoger",
  SHIPPED: "Marcado como enviado",
  DELIVERED: "Marcado como entregado",
  FULFILLMENT_EMAIL_SENT: "Correo de entrega enviado al cliente",
  FULFILLMENT_EMAIL_FAILED: "Falló el correo de entrega",
  BONUS_SENT: "Bonus enviado",
  BONUS_FAILED: "Falló el envío del bonus",
  POST_PURCHASE_ANSWERS_SUBMITTED: "Cliente respondió el cuestionario",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
  RECONCILED: "Estado del pago verificado",
};

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Entró al panel",
  "auth.logout": "Salió del panel",
  "auth.mfa_enrolled": "Activó la verificación en dos pasos",
  "admin.create": "Se creó un usuario del panel",
  "admin.reset_password": "Se cambió una contraseña",
  "admin.reset_mfa": "Se reinició la verificación en dos pasos",
  "admin.revoke": "Se quitó el acceso a un usuario",
  "campaign.create": "Se creó la campaña",
  "campaign.update": "Se editó la campaña",
  "terms.publish": "Se publicaron los términos",
  "reservations.export": "Descargó la lista de pedidos",
  "reservation.view": "Consultó un pedido",
  "reservation.label": "Generó una guía",
  "reservation.shipped": "Marcó un pedido como enviado",
  "reservation.ready_for_pickup": "Marcó un pedido listo para recoger",
  "reservation.delivered": "Marcó un pedido como entregado",
  "reservation.bonus_retry": "Reenvió el bonus",
};

export const FIELD_LABELS: Record<string, string> = {
  productName: "Producto",
  status: "Estado",
  startsAt: "Inicio",
  endsAt: "Cierre",
  unitAmount: "Precio",
  maxQuantityPerReservation: "Máximo por compra",
  pickupEnabled: "Recolección",
  shippingEnabled: "Envío a domicilio",
  pickupPoints: "Puntos de recolección",
  deliveryNote: "Nota de entrega",
  questions: "Preguntas",
};

export const linkClass = "underline underline-offset-4 hover:text-fg";
