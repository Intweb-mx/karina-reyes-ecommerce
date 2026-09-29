import { FieldError, labelClass } from "./fields";

/** Selector de cantidad con botones grandes (fácil en móvil) y anuncio accesible del valor. */
export function QuantityStepper({ value, max, onChange, errors }: { value: number; max: number; onChange: (value: number) => void; errors?: string[] }) {
  const button =
    "grid size-12 place-items-center text-xl text-fg transition-colors duration-(--duration-base) hover:bg-sand disabled:cursor-not-allowed disabled:text-muted/50 disabled:hover:bg-transparent";
  return (
    <div>
      <span id="quantity-label" className={labelClass}>
        Cantidad
      </span>
      <div role="group" aria-labelledby="quantity-label" aria-describedby={errors?.length ? "quantity-error" : "quantity-hint"} className="mt-2 inline-flex items-center border border-border bg-surface">
        <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Quitar uno">
          −
        </button>
        <output id="quantity" aria-live="polite" className="w-12 text-center text-base font-semibold lining-nums tabular-nums">
          {value}
        </output>
        <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Agregar uno">
          +
        </button>
      </div>
      <p id="quantity-hint" className="mt-1.5 text-xs text-muted">
        Máximo {max} por reserva.
      </p>
      <FieldError id="quantity" errors={errors} />
    </div>
  );
}
