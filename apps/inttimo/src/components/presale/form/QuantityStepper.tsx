import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { FieldError, labelClass } from "./fields";

/** Selector de cantidad: botones grandes (cómodos en móvil), valor anunciado y límite visible. */
export function QuantityStepper({ value, max, onChange, errors }: { value: number; max: number; onChange: (value: number) => void; errors?: string[] }) {
  const button =
    "grid size-14 place-items-center text-fg transition-colors duration-(--duration-base) ease-soft hover:bg-sand/70 active:bg-sand focus-visible:relative focus-visible:z-10 disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent";
  return (
    <div>
      <span id="quantity-label" className={labelClass}>
        Cantidad
      </span>
      <div
        role="group"
        aria-labelledby="quantity-label"
        aria-describedby={errors?.length ? "quantity-error" : "quantity-hint"}
        className="mt-2.5 inline-flex items-stretch divide-x divide-border border border-border bg-[#fffdf9] shadow-[inset_0_1px_2px_rgb(34_28_23/0.04)]"
      >
        <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Quitar uno">
          <MinusIcon className="size-4" />
        </button>
        <output id="quantity" aria-live="polite" className="grid w-16 place-items-center font-serif text-2xl font-medium lining-nums tabular-nums">
          <span key={value} className="animate-tick">
            {value}
          </span>
        </output>
        <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Agregar uno">
          <PlusIcon className="size-4" />
        </button>
      </div>
      <p id="quantity-hint" className="mt-1.5 text-sm text-muted">
        Máximo {max} por reserva.
      </p>
      <FieldError id="quantity" errors={errors} />
    </div>
  );
}
