"use client";

import { useActionState } from "react";
import { verifyMfa } from "../../auth-actions";
import { Alert, buttonClass, inputClass } from "../../ui";

/** Solo para cuentas que ya activaron una app autenticadora: la piden después del correo. */
export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <label className="block text-sm">
        Código
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`} />
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Verificando…" : "Verificar"}
      </button>
    </form>
  );
}
