/**
 * Piezas visuales del panel interno. Mismo lenguaje que el sitio (tokens de inttimo) pero más denso y operativo:
 * pensado para que Karina gestione pedidos rápido, en computadora o en el celular.
 */
import type { ReactNode } from "react";

export const inputClass =
  "mt-1.5 block w-full min-h-11 border border-border bg-[#fffdf9] px-3.5 py-2 text-sm text-fg outline-none transition-[border-color,box-shadow] duration-(--duration-base) " +
  "hover:border-fg/30 focus:border-fg focus:shadow-[0_0_0_3px_var(--color-sand)] focus-visible:outline-none";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-4 py-2 text-sm font-semibold text-bg transition-colors duration-(--duration-base) hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-60";
export const linkClass = "underline underline-offset-4 hover:text-fg";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-border bg-[#fffdf9] px-4 py-2 text-sm font-medium transition-colors duration-(--duration-base) hover:border-fg/40 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60";

export function Card({ title, description, children, actions, className = "" }: { title?: string; description?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`border border-border bg-[#fffdf9] shadow-[0_1px_2px_rgb(34_28_23/0.04)] ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "attention" | "good" }) {
  const accent = tone === "attention" ? "border-l-warning" : tone === "good" ? "border-l-success" : "border-l-border";
  return (
    <div className={`border border-l-4 border-border bg-[#fffdf9] px-4 py-3.5 ${accent}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none font-medium lining-nums tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "ok" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`border px-3.5 py-2.5 text-sm ${tone === "error" ? "border-danger/40 bg-danger/5 text-danger" : "border-success/40 bg-success/5 text-fg"}`}
    >
      {children}
    </p>
  );
}

export type Tone = "neutral" | "good" | "attention" | "bad" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-surface text-fg/80",
  good: "border-success/40 bg-success/15 text-success",
  attention: "border-warning/40 bg-warning/15 text-warning",
  bad: "border-danger/30 bg-danger/10 text-danger",
  info: "border-ink/20 bg-ink/5 text-fg",
};

/** Etiqueta de estado con color: se lee de un vistazo en listas y tablas. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export const STATUS_TONES: Record<string, Tone> = {
  pending_payment: "neutral",
  processing: "attention",
  paid: "good",
  payment_failed: "bad",
  expired: "neutral",
  partially_refunded: "attention",
  refunded: "bad",
  canceled: "neutral",
};

export const FULFILLMENT_TONES: Record<string, Tone> = {
  pending: "attention",
  ready_for_pickup: "info",
  shipped: "info",
  delivered: "good",
};

/** Encabezado de página: regreso, título, subtítulo y acciones. */
export function PageHeader({ back, title, subtitle, actions }: { back?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm text-muted">{back}</div>}
        <h1 className="font-serif text-3xl leading-tight font-medium sm:text-4xl">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
    </div>
  );
}

/** Días transcurridos desde una fecha, para marcar pedidos que llevan tiempo esperando. */
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
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
  MANUAL_SALE_RECORDED: "Venta registrada en el panel",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = { stripe: "Tarjeta (Stripe)", cash: "Efectivo", transfer: "Transferencia" };

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Entró al panel",
  "reservation.manual_sale": "Registró una venta en persona",
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
  "reservation.hand_to_carrier": "Entregó un pedido a la paquetería",
  "reservation.note": "Agregó una nota a un pedido",
  "reservation.resend_email": "Reenvió un correo a un cliente",
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

