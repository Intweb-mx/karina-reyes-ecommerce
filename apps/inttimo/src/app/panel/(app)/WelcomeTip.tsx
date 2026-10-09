"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookIcon, CloseIcon } from "@/components/ui/icons";

const KEY = "inttimo:panel:welcome-dismissed";

/** Bienvenida con acceso a la guía. Se puede cerrar; se recuerda solo en este navegador. */
export function WelcomeTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este navegador
      setShow(window.localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  return (
    <aside className="animate-rise relative flex flex-wrap items-center gap-x-6 gap-y-3 border border-border border-l-4 border-l-bronze bg-[#fffdf9] py-4 pr-14 pl-5 [animation-duration:400ms]">
      <BookIcon className="size-6 shrink-0 text-bronze max-sm:hidden" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">¿Primera vez en el panel?</p>
        <p className="mt-0.5 text-sm text-muted">En la barra lateral, cada sección dice para qué sirve. La guía explica la rutina diaria y qué significa cada estado.</p>
      </div>
      <Link prefetch={false} href="/panel/ayuda" className="inline-flex min-h-10 items-center bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-ink/85">Ver guía</Link>
      <button
        type="button"
        aria-label="Cerrar bienvenida"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // Sin almacenamiento: vuelve a aparecer la próxima vez.
          }
        }}
        className="absolute top-2 right-2 grid size-10 place-items-center text-muted hover:text-fg"
      >
        <CloseIcon className="size-4" />
      </button>
    </aside>
  );
}
