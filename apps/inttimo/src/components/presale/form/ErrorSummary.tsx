import type { RefObject } from "react";
import { AlertIcon } from "@/components/ui/icons";
import { formCopy } from "@/content/presale";
import type { FieldErrors } from "./validation";

/**
 * Resumen de errores al inicio del formulario (patrón GOV.UK): recibe el foco tras un envío fallido
 * y cada enlace lleva al campo correspondiente.
 */
export function ErrorSummary({
  errors,
  labels,
  message,
  ref,
}: {
  errors: FieldErrors;
  labels: Record<string, string>;
  message: string | null;
  ref: RefObject<HTMLDivElement | null>;
}) {
  const keys = Object.keys(errors);
  const visible = keys.length > 0 || !!message;

  return (
    <div ref={ref} tabIndex={-1} className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-danger">
      {visible && (
        <div role="alert" aria-labelledby="error-summary-title" className="border border-danger/30 border-l-4 border-l-danger bg-danger/5 px-5 py-4 text-sm">
          <p id="error-summary-title" className="flex items-start gap-2 font-semibold text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {keys.length ? formCopy.errorSummaryTitle(keys.length) : message}
          </p>
          {keys.length > 0 && message && <p className="mt-1 pl-6 text-fg/80">{message}</p>}
          {keys.length > 0 && (
            <ul className="mt-3 space-y-1.5 pl-6">
              {keys.map((key) => (
                <li key={key}>
                  <a
                    href={`#${key}`}
                    className="text-danger underline decoration-danger/40 underline-offset-4 hover:decoration-danger"
                    onClick={(event) => {
                      // Los ids llevan punto ("answers.x"): se enfoca a mano en lugar de depender del hash.
                      const field = document.getElementById(key);
                      if (!field) return;
                      event.preventDefault();
                      field.focus();
                      field.scrollIntoView({ block: "center" });
                    }}
                  >
                    {labels[key] ?? key}: {errors[key]![0]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
