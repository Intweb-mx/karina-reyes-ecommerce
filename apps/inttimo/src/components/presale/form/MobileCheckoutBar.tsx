"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { submitLabel } from "./OrderSummary";

/**
 * En móvil, mientras se llena el formulario, mantiene a la vista el total y el botón de pago.
 * Se oculta cuando el resumen (con su propio botón) ya está en pantalla o fuera del formulario.
 */
export function MobileCheckoutBar({ total, status, completed, steps }: { total: string; status: "idle" | "submitting" | "redirecting"; completed: number; steps: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const form = document.getElementById("reserva");
    const summary = document.getElementById("resumen-reserva");
    if (!form || !summary) return;
    const inView = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
      setVisible(!!inView.get(form) && !inView.get(summary));
    });
    observer.observe(form);
    observer.observe(summary);
    return () => observer.disconnect();
  }, []);

  const busy = status !== "idle";

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-20px_rgb(34_28_23/0.35)] backdrop-blur transition-transform duration-(--duration-base) ease-soft lg:hidden print:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">
            Total · paso {Math.min(completed + 1, steps)} de {steps}
          </p>
          <p className="font-serif text-2xl leading-tight font-medium lining-nums tabular-nums">{total}</p>
        </div>
        <Button type="submit" size="md" loading={busy} disabled={busy} className="shrink-0">
          {busy ? submitLabel(status) : "Pagar"}
        </Button>
      </div>
    </div>
  );
}
