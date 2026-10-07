import type { ReactNode } from "react";
import { FieldError, Optional, inputClass, labelClass, textareaClass } from "@/components/presale/form/fields";

type Base = { name: string; label: string; errors?: string[]; optional?: boolean; hint?: ReactNode; className?: string };

/** Campo etiquetado con error y ayuda enlazados (aria-describedby). Reutiliza los estilos del checkout. */
export function Field({
  name,
  label,
  errors,
  optional,
  hint,
  className = "",
  as = "input",
  options,
  ...input
}: Base & { as?: "input" | "textarea" | "select"; options?: { value: string; label: string }[] } & Record<string, unknown>) {
  const id = `f-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, errors?.length ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, name, "aria-invalid": errors?.length ? true : undefined, "aria-describedby": describedBy, ...input };
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional && <Optional />}
      </label>
      <div className="mt-2.5">
        {as === "textarea" ? (
          <textarea rows={5} className={textareaClass} {...common} />
        ) : as === "select" ? (
          <select className={`${inputClass} appearance-none`} {...common}>
            {options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <input className={inputClass} {...common} />
        )}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>}
      <FieldError id={name} errors={errors} />
    </div>
  );
}

export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor="website">No llenar</label>
      <input id="website" name="website" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

export function SentMessage({ title, body, reference }: { title: string; body: string; reference?: string }) {
  return (
    <div role="status" className="animate-rise border border-success/30 bg-success/5 p-6 sm:p-8">
      <p className="font-serif text-3xl font-medium">{title}</p>
      <p className="mt-2 leading-relaxed text-muted">{body}</p>
      {reference && <p className="mt-4 text-sm">Referencia: <span className="font-mono">{reference}</span></p>}
    </div>
  );
}
