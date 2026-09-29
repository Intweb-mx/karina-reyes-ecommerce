import { Button } from "@/components/ui/Button";
import { CheckIcon, LockIcon } from "@/components/ui/icons";
import { formCopy } from "@/content/presale";
import { formatMoney } from "@/lib/format";

type Step = { id: string; label: string; done: boolean; detail?: string };
type Status = "idle" | "submitting" | "redirecting";

export function submitLabel(status: Status) {
  return status === "redirecting" ? formCopy.redirecting : status === "submitting" ? formCopy.submitting : formCopy.submit;
}

/** Resumen lateral: producto, total, avance del formulario y botón de pago. Fijo en escritorio. */
export function OrderSummary({
  productName,
  unitAmount,
  currency,
  quantity,
  steps,
  completed,
  status,
}: {
  productName: string;
  unitAmount: number;
  currency: string;
  quantity: number;
  steps: Step[];
  completed: number;
  status: Status;
}) {
  const busy = status !== "idle";
  const percent = Math.round((completed / steps.length) * 100);

  return (
    <aside id="resumen-reserva" aria-label="Resumen de tu reserva" className="lg:sticky lg:top-24 lg:self-start">
      <div className="border border-border bg-surface shadow-[0_24px_48px_-32px_rgb(34_28_23/0.35)]">
        <div className="p-6 sm:p-8">
          <p className="eyebrow text-muted">Tu reserva</p>
          <p className="mt-3 font-serif text-3xl leading-tight font-medium">{productName}</p>
          <dl className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Precio de preventa</dt>
              <dd className="lining-nums tabular-nums">{formatMoney(unitAmount, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Cantidad</dt>
              <dd className="lining-nums tabular-nums">× {quantity}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
              <dt className="font-semibold">Total</dt>
              <dd key={quantity} className="animate-tick font-serif text-4xl font-medium lining-nums tabular-nums" aria-live="polite">
                {formatMoney(unitAmount * quantity, currency)}
              </dd>
            </div>
          </dl>
        </div>

        <nav aria-label="Avance del formulario" className="hidden border-t border-border px-6 py-5 sm:px-8 lg:block">
          <div className="flex items-center justify-between text-xs">
            <span className="eyebrow text-muted">Tu avance</span>
            <span className="font-semibold lining-nums tabular-nums">{percent}%</span>
          </div>
          <div aria-hidden="true" className="mt-3 h-1 overflow-hidden bg-sand">
            <div className="h-full bg-success transition-[width] duration-500 ease-soft" style={{ width: `${percent}%` }} />
          </div>
          <ol className="mt-4 space-y-1">
            {steps.map((step, index) => (
              <li key={step.id}>
                <a href={`#${step.id}`} className="-mx-2 flex items-center gap-3 px-2 py-1.5 text-sm text-fg/80 transition-colors hover:bg-sand/50 hover:text-fg">
                  <span
                    aria-hidden="true"
                    className={`grid size-5 shrink-0 place-items-center rounded-full border text-[0.625rem] font-semibold transition-colors duration-(--duration-base) ${
                      step.done ? "border-success bg-success text-on-ink" : "border-border text-muted"
                    }`}
                  >
                    {step.done ? <CheckIcon className="animate-pop size-3" /> : index + 1}
                  </span>
                  <span className={`flex-1 ${step.done ? "text-fg" : ""}`}>{step.label}</span>
                  {step.detail && <span className="text-xs text-muted lining-nums tabular-nums">{step.detail}</span>}
                  <span className="sr-only">{step.done ? "(completo)" : "(pendiente)"}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="border-t border-border p-6 sm:p-8">
          <Button type="submit" block arrow="right" loading={busy} disabled={busy}>
            {submitLabel(status)}
          </Button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <LockIcon className="mt-px size-3.5 shrink-0" />
            {formCopy.secureNote}
          </p>
        </div>
      </div>
    </aside>
  );
}
