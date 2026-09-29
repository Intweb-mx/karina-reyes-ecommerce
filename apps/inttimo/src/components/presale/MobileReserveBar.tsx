"use client";

import { useEffect, useState } from "react";
import { AnchorButton } from "@/components/ui/Button";

/**
 * Barra fija en móvil con el precio y un atajo al formulario. Solo aparece cuando ni el encabezado
 * de la preventa ni el formulario están a la vista, para no tapar contenido útil.
 */
export function MobileReserveBar({ price }: { price: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("preventa-hero");
    const form = document.getElementById("reserva");
    if (!hero || !form) return;
    const inView = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
      setVisible(!inView.get(hero) && !inView.get(form));
    });
    observer.observe(hero);
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-(--duration-base) ease-soft lg:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
        <div>
          <p className="text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Precio de preventa</p>
          <p className="font-serif text-2xl leading-tight font-medium lining-nums">{price}</p>
        </div>
        <AnchorButton href="#reserva" size="md" className="shrink-0">
          Reservar
        </AnchorButton>
      </div>
    </div>
  );
}
