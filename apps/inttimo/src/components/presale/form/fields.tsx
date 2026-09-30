import type { ComponentProps, ReactNode } from "react";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";

/*
 * Campos del formulario de preventa.
 * Estados visibles: reposo → hover (borde más oscuro) → foco (borde tinta + halo arena) → válido (marca verde) / error (borde y halo rojo).
 */
const fieldSurface =
  "border border-border bg-[#fffdf9] text-fg shadow-[inset_0_1px_2px_rgb(34_28_23/0.04)] outline-none " +
  "transition-[border-color,box-shadow,background-color] duration-(--duration-base) ease-soft " +
  "hover:border-fg/30 focus:border-fg focus:shadow-[0_0_0_4px_var(--color-sand)] focus-visible:outline-none " +
  "aria-invalid:border-danger/70 aria-invalid:bg-danger/[0.02] aria-invalid:focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-danger)_14%,transparent)]";

export const inputClass = `block w-full min-h-14 px-4 text-[1.0625rem] placeholder:text-muted/55 ${fieldSurface}`;
export const textareaClass = `block w-full min-h-36 resize-y px-4 py-3.5 text-[1.0625rem] leading-relaxed placeholder:text-muted/55 ${fieldSurface}`;
export const labelClass = "block text-[0.9375rem] font-semibold tracking-[-0.005em]";

export function Optional() {
  return <span className="ml-1 text-xs font-normal tracking-normal text-muted">(opcional)</span>;
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={`${id}-error`} className="animate-rise mt-2 flex items-start gap-1.5 text-sm font-medium text-danger [animation-duration:280ms]">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      {errors.join(" ")}
    </p>
  );
}

/** ids de ayuda y error para `aria-describedby`, en ese orden. */
export function describedBy(id: string, { hint, errors }: { hint?: boolean; errors?: string[] }) {
  return [hint && `${id}-hint`, errors?.length && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

export function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
      {children}
    </p>
  );
}

export function CharCount({ value, max }: { value: string; max: number }) {
  const ratio = value.length / max;
  return (
    <span aria-hidden="true" className={`text-xs lining-nums tabular-nums transition-colors ${ratio >= 0.9 ? "text-warning" : "text-muted/80"}`}>
      {value.length.toLocaleString("es-MX")} / {max.toLocaleString("es-MX")}
    </span>
  );
}

/** Estado a la derecha del campo: marca verde si es válido, alerta si hay error. */
function TrailingState({ valid, invalid }: { valid?: boolean; invalid?: boolean }) {
  if (invalid) {
    return (
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-danger">
        <AlertIcon className="animate-pop size-5" />
      </span>
    );
  }
  if (!valid) return null;
  return (
    <span aria-hidden="true" className="animate-pop pointer-events-none absolute top-1/2 right-4 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-success text-on-ink">
      <CheckIcon className="size-3" />
    </span>
  );
}

/** Campo de texto con icono opcional a la izquierda y estado (correcto / error) a la derecha. */
export function TextInput({ valid, icon, className = "", ...props }: { valid?: boolean; icon?: ReactNode } & ComponentProps<"input">) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <div className="group/field relative mt-2.5">
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted/70 transition-colors duration-(--duration-base) group-focus-within/field:text-fg"
        >
          {icon}
        </span>
      )}
      <input {...props} className={`${inputClass} ${icon ? "pl-12" : ""} ${valid || invalid ? "pr-12" : ""} ${className}`} />
      <TrailingState valid={valid} invalid={invalid} />
    </div>
  );
}

/** Área de texto con contador integrado en la esquina inferior. */
export function TextArea({ value, max, ...props }: { value: string; max: number } & Omit<ComponentProps<"textarea">, "value" | "maxLength">) {
  return (
    <div className="relative mt-2.5">
      <textarea {...props} value={value} maxLength={max} className={`${textareaClass} pb-9`} />
      <span className="pointer-events-none absolute right-4 bottom-3">
        <CharCount value={value} max={max} />
      </span>
    </div>
  );
}

/**
 * Tarjeta seleccionable (radio o casilla).
 * Con `marker` (A, B, C…) el control nativo queda oculto a la vista pero accesible, y la insignia muestra el estado;
 * sin `marker` se usa la casilla propia `.choice`.
 */
export function ChoiceTile({ invalid, marker, description, children, ...input }: { invalid?: boolean; marker?: string; description?: ReactNode; children: ReactNode } & ComponentProps<"input">) {
  const round = input.type === "radio";
  return (
    <label
      className={`group/tile relative flex min-h-14 cursor-pointer items-center gap-3 border bg-[#fffdf9] px-3.5 py-3 sm:gap-4 sm:px-4 text-[0.9375rem] leading-snug select-none
        transition-[border-color,background-color,box-shadow,transform] duration-(--duration-base) ease-soft
        hover:-translate-y-px hover:border-fg/35 hover:shadow-[0_10px_24px_-18px_rgb(34_28_23/0.5)]
        active:translate-y-0
        has-checked:border-ink has-checked:bg-surface has-checked:shadow-[inset_0_0_0_1px_var(--color-ink),0_10px_24px_-18px_rgb(34_28_23/0.45)]
        has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-fg
        ${invalid ? "border-danger/60" : "border-border"}`}
    >
      {marker ? (
        <>
          <input {...input} className="peer sr-only" aria-invalid={invalid || undefined} />
          <span
            aria-hidden="true"
            className={`grid size-8 shrink-0 place-items-center border text-xs font-semibold transition-colors duration-(--duration-base) ease-soft ${round ? "rounded-full" : ""}
              border-border bg-bg text-muted group-hover/tile:border-fg/40 group-hover/tile:text-fg
              peer-checked:border-ink peer-checked:bg-ink peer-checked:text-on-ink`}
          >
            <span className="group-has-checked/tile:hidden">{marker}</span>
            <CheckIcon className="hidden size-4 group-has-checked/tile:block group-has-checked/tile:animate-[pop-in_420ms_var(--ease-out-soft)_both]" />
          </span>
        </>
      ) : (
        <input {...input} className="choice" aria-invalid={invalid || undefined} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** Sección numerada del checkout en tarjeta (01, 02…); el número cambia a una marca al completarla. */
export function FormSection({ step, title, description, id, complete, children }: { step: string; title: string; description?: string; id: string; complete?: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 border bg-[#fffdf9] px-5 py-6 shadow-[0_1px_2px_rgb(34_28_23/0.04)] transition-colors duration-500 max-sm:-mx-4 max-sm:border-x-0 sm:p-8 ${complete ? "border-success/40" : "border-border"}`}
    >
      <header className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-full border font-serif text-lg lining-nums transition-colors duration-(--duration-base) ${
            complete ? "border-success bg-success text-on-ink" : "border-border text-fg/60"
          }`}
        >
          {complete ? <CheckIcon key="done" className="animate-pop size-4" /> : step}
        </span>
        <div>
          <h3 id={`${id}-title`} className="font-serif text-[1.625rem] leading-tight font-medium sm:text-[1.75rem]">
            {title}
            {complete && <span className="sr-only"> (completo)</span>}
          </h3>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      </header>
      <div className="mt-6 space-y-7 sm:mt-7">{children}</div>
    </section>
  );
}
