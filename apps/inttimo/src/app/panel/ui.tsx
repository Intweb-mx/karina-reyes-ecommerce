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
