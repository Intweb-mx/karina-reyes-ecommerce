"use client";

import { useState } from "react";
import { MailIcon } from "@/components/ui/icons";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; emailHint: string } | { kind: "error"; message: string };

/** Enlace vencido: pide uno nuevo, que llega al correo de la compra (el servidor no acepta otro destino). */
export function BonusResend({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function resend() {
    setStatus({ kind: "sending" });
    try {
      const response = await fetch(`/bonus/${encodeURIComponent(token)}/reenviar`, { method: "POST", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { sent?: boolean; emailHint?: string; error?: { message?: string } } | null;
      if (response.ok && body?.sent) {
        setStatus({ kind: "sent", emailHint: body.emailHint ?? "tu correo" });
        return;
      }
      setStatus({ kind: "error", message: body?.error?.message ?? "No pudimos reenviarlo. Inténtalo de nuevo en unos minutos." });
    } catch {
      setStatus({ kind: "error", message: "No pudimos reenviarlo. Revisa tu conexión e inténtalo de nuevo." });
    }
  }

  if (status.kind === "sent") {
    return (
      <p className="mt-8 border border-border bg-surface px-4 py-3 text-sm leading-relaxed" role="status">
        Listo. Te mandamos un enlace nuevo a <span className="font-medium">{status.emailHint}</span>. Si no lo ves en unos minutos, revisa la carpeta de spam o promociones.
      </p>
    );
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={resend}
        disabled={status.kind === "sending"}
        className="inline-flex min-h-12 items-center justify-center gap-2 bg-ink px-6 text-sm font-medium text-on-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <MailIcon className="size-4" />
        {status.kind === "sending" ? "Enviando…" : "Reenviarme mi bonus por correo"}
      </button>
      {status.kind === "error" && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {status.message}
        </p>
      )}
    </div>
  );
}
