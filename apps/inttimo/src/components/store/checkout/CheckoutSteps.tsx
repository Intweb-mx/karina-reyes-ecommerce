import Link from "next/link";
import { CheckIcon } from "@/components/ui/icons";

const STEPS = [
  { label: "Carrito", href: "/carrito" },
  { label: "Datos y entrega", href: "/checkout" },
  { label: "Pago seguro", href: null },
  { label: "Confirmación", href: null },
] as const;

/** Progreso de la compra (carrito → datos → pago → confirmación): la persona siempre sabe dónde está y cuánto falta. */
export function CheckoutSteps({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <nav aria-label="Pasos de la compra" className="mb-8">
      <ol className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const dot = (
            <span
              aria-hidden="true"
              className={`grid size-6 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-semibold lining-nums transition-colors ${
                done ? "border-success bg-success text-on-ink" : active ? "border-fg bg-fg text-bg" : "border-border text-muted"
              }`}
            >
              {done ? <CheckIcon className="size-3" /> : index + 1}
            </span>
          );
          const label = <span className={`${active ? "font-semibold text-fg" : done ? "text-fg/80" : "text-muted"} ${active ? "" : "max-sm:sr-only"}`}>{step.label}</span>;
          return (
            <li key={step.label} aria-current={active ? "step" : undefined} className="flex items-center gap-2 sm:gap-3">
              {done && step.href ? (
                <Link href={step.href} className="flex items-center gap-2 underline-offset-4 hover:underline">
                  {dot}
                  {label}
                </Link>
              ) : (
                <span className="flex items-center gap-2">
                  {dot}
                  {label}
                </span>
              )}
              {index < STEPS.length - 1 && <span aria-hidden="true" className={`h-px w-5 sm:w-10 ${done ? "bg-success" : "bg-border"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
