"use client";

import { useActionState } from "react";
import { Alert, buttonClass, inputClass } from "../../ui";
import type { ResendDownloadState } from "./actions";

type Action = (state: ResendDownloadState, form: FormData) => Promise<ResendDownloadState>;

export function ResendDownloadForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="orderNumber">
        Folio del pedido
      </label>
      <input id="orderNumber" name="orderNumber" required autoComplete="off" placeholder="INT-7K2M9QX4TB" className={`${inputClass} font-mono uppercase`} />
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.ok}</Alert>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Enviando…" : "Enviar enlace nuevo"}
      </button>
    </form>
  );
}
