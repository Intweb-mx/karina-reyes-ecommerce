import { ViewTransition, type ReactNode } from "react";

/**
 * Transición suave entre páginas de la tienda (View Transitions API vía React).
 * La página saliente se desvanece rápido y la nueva sube con calma; el header queda fijo (store-header).
 * Sin soporte del navegador o con "reducir movimiento", el cambio es instantáneo.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
