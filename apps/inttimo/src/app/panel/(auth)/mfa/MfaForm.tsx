"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { startMfaEnrollment, verifyMfa } from "../../auth-actions";
import { Alert, buttonClass, inputClass } from "../../ui";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function MfaForm({ enrolling }: { enrolling: boolean }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  // Cada alta invalida la anterior: pedirla dos veces (StrictMode, re-montajes) dejaría el QR mostrado sin validez.
  const requested = useRef(false);

  useEffect(() => {
    if (!enrolling || requested.current) return;
    requested.current = true;
    startMfaEnrollment().then((result) => ("error" in result ? setEnrollError(result.error) : setEnrollment(result)));
  }, [enrolling]);

  if (enrollError) return <Alert>{enrollError}</Alert>;
  if (enrolling && !enrollment) return <p className="text-sm text-muted">Preparando código…</p>;

  return (
    <form action={action} className="space-y-4">
      {enrollment && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URL generado por Supabase */}
          <img src={enrollment.qrCode} alt="Código QR para la app autenticadora" width={200} height={200} className="mx-auto border border-border bg-white p-2" />
          <p className="text-xs text-muted">
            ¿No puedes escanear? Clave manual: <code className="break-all select-all">{enrollment.secret}</code>
          </p>
          <input type="hidden" name="factorId" value={enrollment.factorId} />
        </div>
      )}
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
