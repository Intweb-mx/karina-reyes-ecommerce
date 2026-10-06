"use client";

import { useActionState } from "react";
import { signIn } from "../../auth-actions";
import { Alert, buttonClass, inputClass } from "../../ui";

export function LoginForm({ forbidden }: { forbidden: boolean }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      {forbidden && !state?.error && <Alert>Esta cuenta no tiene acceso al panel.</Alert>}
      {state?.error && <Alert>{state.error}</Alert>}
      <label className="block text-sm font-medium">
        Correo
        <input name="email" type="email" autoComplete="username" required defaultValue={state?.email} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Contraseña
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
