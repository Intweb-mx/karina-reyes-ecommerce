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
      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 print:static print:border-0">
        <div className="container-page flex h-(--header-height) items-center justify-between">
          <Wordmark />
          <p className="flex items-center gap-2 text-xs text-muted print:hidden">
            <LockIcon className="size-4" />
            <span className="hidden sm:inline">Pago seguro con Stripe</span>
            <span className="sm:hidden">Pago seguro</span>
          </p>
        </div>
      </header>

      <div id="contenido" className="flex flex-1 flex-col">
        {children}
      </div>

      <footer className="mt-auto border-t border-border/70 print:hidden">
        <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-end sm:justify-between">
          <Wordmark />
          <p className="text-xs text-muted">© {new Date().getFullYear()} inttimo. Todos los derechos reservados.</p>
        </div>
      </footer>
    </>
  );
}
