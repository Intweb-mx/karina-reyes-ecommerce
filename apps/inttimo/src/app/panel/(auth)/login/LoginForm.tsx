"use client";

import { useActionState, useState } from "react";
import { requestAccess, verifyAccessCode } from "../../auth-actions";
import { Alert, buttonClass, inputClass, linkClass } from "../../ui";

export function LoginForm({ forbidden }: { forbidden: boolean }) {
  const [request, requestAction, requesting] = useActionState(requestAccess, undefined);
  const [verify, verifyAction, verifying] = useActionState(verifyAccessCode, undefined);
  // "Usar otro correo": oculta los resultados que ya llegaron hasta que llegue uno nuevo.
  const [dismissed, setDismissed] = useState<unknown[]>([]);
  const fresh = <T,>(state: T) => (dismissed.includes(state) ? undefined : state);

  const sent = Boolean(fresh(request)?.sent || fresh(verify)?.sent);
  const email = fresh(verify)?.email ?? fresh(request)?.email ?? request?.email ?? "";

  if (sent) {
    return (
      <div className="space-y-5">
        <Alert tone="ok">
          Si <strong>{email}</strong> tiene acceso, ya te llegó un correo. Presiona <strong>Entrar al panel</strong> en el correo y listo.
        </Alert>
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          {verify?.error && <Alert>{verify.error}</Alert>}
          <label className="block text-sm font-medium">
            ¿Abriste el correo en otro dispositivo? Escribe el código
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6,10}"
              maxLength={10}
              required
              className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
            />
          </label>
          <button type="submit" disabled={verifying} className={`${buttonClass} w-full`}>
            {verifying ? "Entrando…" : "Entrar con el código"}
          </button>
        </form>
        <div className="flex items-center justify-between text-sm text-muted">
          <form action={requestAction}>
            <input type="hidden" name="email" value={email} />
            <button type="submit" disabled={requesting} className={linkClass}>
              {requesting ? "Mandando…" : "Mandar otro correo"}
            </button>
          </form>
          <button type="button" onClick={() => setDismissed([request, verify])} className={linkClass}>
            Usar otro correo
          </button>
        </div>
        {request?.error && <Alert>{request.error}</Alert>}
        <p className="text-xs text-muted">Revisa también la carpeta de spam o promociones. El correo llega de inttimo.</p>
      </div>
    );
  }

  return (
    <form action={requestAction} className="space-y-4">
      {forbidden && !request?.error && <Alert>Esta cuenta no tiene acceso al panel.</Alert>}
      {(fresh(request)?.error ?? fresh(verify)?.error) && <Alert>{fresh(request)?.error ?? fresh(verify)?.error}</Alert>}
      <label className="block text-sm font-medium">
        Tu correo
        <input name="email" type="email" autoComplete="email" required defaultValue={email} className={inputClass} />
      </label>
      <button type="submit" disabled={requesting} className={`${buttonClass} w-full`}>
        {requesting ? "Mandando…" : "Mandarme el acceso"}
      </button>
      <p className="text-xs text-muted">Te llega un correo con un botón para entrar. Sin contraseña.</p>
    </form>
  );
}
