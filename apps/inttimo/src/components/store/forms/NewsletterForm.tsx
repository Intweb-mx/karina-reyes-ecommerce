"use client";

import { useState, type FormEvent } from "react";
import { getStoreApi } from "@/lib/store/api";

/** Suscripción con consentimiento explícito; nunca se suscribe a nadie por comprar (CLAUDE.md §26). */
export function NewsletterForm({ source, tone = "ink" }: { source: string; tone?: "ink" | "light" }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ink = tone === "ink";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("error");
      setMessage("Escribe un correo válido.");
      return;
    }
    setState("sending");
    const result = await getStoreApi().newsletter({ email, consent: true, source, website: String(form.get("website") ?? "") });
    setState(result.ok ? "done" : "error");
    setMessage(result.ok ? "¡Listo! Revisa tu correo para confirmar tu suscripción." : result.error.message);
  }

  if (state === "done") {
    return <p role="status" className={`text-sm ${ink ? "text-on-ink" : "text-fg"}`}>{message}</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`newsletter-${source}`} className="sr-only">Correo electrónico</label>
        <input
          id={`newsletter-${source}`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Tu correo electrónico"
          aria-invalid={state === "error" || undefined}
          aria-describedby={message ? `newsletter-${source}-msg` : `newsletter-${source}-hint`}
          className={`min-h-12 flex-1 border px-4 text-sm outline-none focus:shadow-[0_0_0_3px_var(--color-sand)] ${ink ? "border-on-ink/25 bg-on-ink/10 text-on-ink placeholder:text-on-ink-muted focus:border-on-ink" : "border-border bg-[#fffdf9] focus:border-fg"}`}
        />
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" disabled={state === "sending"} className={`min-h-12 px-5 text-xs font-semibold tracking-[0.16em] uppercase transition-colors disabled:opacity-60 ${ink ? "bg-on-ink text-ink hover:bg-sand" : "bg-accent text-bg hover:bg-ink/85"}`}>
          {state === "sending" ? "Enviando…" : "Suscribirme"}
        </button>
      </div>
      {message ? (
        <p id={`newsletter-${source}-msg`} role="alert" className="mt-2 text-xs text-danger">{message}</p>
      ) : (
        <p id={`newsletter-${source}-hint`} className={`mt-2 text-xs ${ink ? "text-on-ink-muted" : "text-muted"}`}>Sin spam. Puedes darte de baja cuando quieras.</p>
      )}
    </form>
  );
}
