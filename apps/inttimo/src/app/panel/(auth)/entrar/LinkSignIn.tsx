"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { signInWithLink, type FormState } from "../../auth-actions";
import { Alert, buttonClass, linkClass } from "../../ui";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/**
 * Se entra con un botón y no al abrir la página: así un antivirus de correo que abra el enlace no gasta el acceso.
 */
export function LinkSignIn() {
  // null en el servidor (no conoce el fragmento); "" en el navegador si el enlace llegó sin token.
  const token = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => null);
  const [state, action, pending] = useActionState<FormState>(() => signInWithLink(token ?? ""), undefined);

  if (token === null) return <p className="text-sm text-muted">Cargando…</p>;
  if (!token) {
    return (
      <div className="space-y-4">
        <Alert>El enlace está incompleto. Ábrelo desde el botón del correo o pide otro.</Alert>
        <Link href="/panel/login" className={linkClass}>Pedir otro correo</Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error ? (
        <>
          <Alert>{state.error}</Alert>
          <Link href="/panel/login" className={`${buttonClass} block w-full text-center`}>Pedir otro correo</Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Presiona el botón para entrar al panel en este navegador.</p>
          <button type="submit" disabled={pending} autoFocus className={`${buttonClass} w-full`}>
            {pending ? "Entrando…" : "Entrar al panel"}
          </button>
        </>
      )}
    </form>
  );
}
