import type { ComponentProps, ReactNode } from "react";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";

export const inputClass =
  "block w-full min-h-13 border border-border bg-surface px-4 py-3 text-base text-fg outline-none placeholder:text-muted/60 " +
  "transition-[border-color,box-shadow,background-color] duration-(--duration-base) ease-soft " +
  "hover:border-fg/35 focus:border-fg focus:bg-bg focus:shadow-[0_0_0_4px_var(--color-sand)] focus-visible:outline-none " +
  "aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-danger)_14%,transparent)]";
export const labelClass = "block text-sm font-semibold";
export const tileClass =
  "group/tile relative flex min-h-13 cursor-pointer items-start gap-3.5 border border-border bg-surface px-4 py-3.5 text-sm leading-snug " +
  "transition-[border-color,background-color,box-shadow] duration-(--duration-base) ease-soft " +
  "hover:border-fg/35 hover:bg-bg has-checked:border-ink has-checked:bg-bg has-checked:shadow-[inset_0_0_0_1px_var(--color-ink)]";

export function Optional() {
  return <span className="font-normal text-muted"> (opcional)</span>;
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={`${id}-error`} className="animate-rise mt-2 flex items-start gap-1.5 text-sm text-danger [animation-duration:300ms]">
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
  const near = value.length >= max * 0.9;
  return (
    <p aria-hidden="true" className={`mt-1.5 text-right text-xs lining-nums tabular-nums ${near ? "text-warning" : "text-muted"}`}>
      {value.length}/{max}
    </p>
  );
}

/** Input de texto con marca de "correcto" a la derecha cuando el campo ya se validó. */
export function TextInput({ valid, className = "", ...props }: { valid?: boolean } & ComponentProps<"input">) {
  return (
    <div className="relative mt-2">
      <input {...props} className={`${inputClass} ${valid ? "pr-11" : ""} ${className}`} />
      {valid && (
        <span aria-hidden="true" className="animate-pop pointer-events-none absolute top-1/2 right-3.5 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-success text-on-ink">
          <CheckIcon className="size-3" />
        </span>
      )}
    </div>
  );
}

/** Tarjeta seleccionable (radio o casilla) con control propio y borde marcado al elegirla. */
export function ChoiceTile({ invalid, children, ...input }: { invalid?: boolean; children: ReactNode } & ComponentProps<"input">) {
  return (
    <label className={`${tileClass} ${invalid ? "border-danger/60" : ""}`}>
      <input {...input} className="choice" aria-invalid={invalid || undefined} />
      <span className="flex-1 pt-px">{children}</span>
    </label>
  );
}

/** Sección numerada del formulario (01, 02, 03…); el número cambia a una marca al completarla. */
export function FormSection({ step, title, id, complete, children }: { step: string; title: string; id: string; complete?: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-border pt-8">
      <h3 id={`${id}-title`} className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-full border font-serif text-lg transition-colors duration-(--duration-base) ${
            complete ? "border-success bg-success text-on-ink" : "border-border text-fg/60"
          }`}
        >
          {complete ? <CheckIcon key="done" className="animate-pop size-4" /> : step}
        </span>
        <span className="font-serif text-3xl leading-tight font-medium">{title}</span>
        {complete && <span className="sr-only">(completo)</span>}
      </h3>
      <div className="mt-8 space-y-7 sm:pl-14">{children}</div>
    </section>
  );
}
