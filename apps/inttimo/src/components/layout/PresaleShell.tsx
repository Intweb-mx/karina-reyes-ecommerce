import type { ReactNode } from "react";
import { LockIcon } from "@/components/ui/icons";
import { Wordmark } from "./Wordmark";

/**
 * Marco de las páginas de preventa. La navegación completa de la tienda (CLAUDE.md §9) llega con la Fase 2;
 * aquí no se enlaza a rutas que aún no existen.
 */
export function PresaleShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Saltar al contenido
      </a>
      <header className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
          <Wordmark />
          <p className="flex items-center gap-2 text-xs text-muted">
            <LockIcon className="size-4" />
            <span className="hidden sm:inline">Pago seguro con Stripe</span>
            <span className="sm:hidden">Pago seguro</span>
          </p>
        </div>
      </header>

      <div id="contenido" className="flex flex-1 flex-col">
        {children}
      </div>

      <footer className="mt-auto border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <Wordmark />
          <p className="text-xs text-muted">© {new Date().getFullYear()} inttimo. Todos los derechos reservados.</p>
        </div>
      </footer>
    </>
  );
}
