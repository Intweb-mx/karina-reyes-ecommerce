"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { BagIcon, CheckIcon, CloseIcon, LockIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@/lib/format";
import { CartLineItem } from "./CartLineItem";
import { useCart } from "./CartProvider";
import { useCartQuote } from "./useCartQuote";

/**
 * Carrito lateral: confirma lo agregado sin sacar a la persona de la página y deja el checkout a un clic.
 * Diálogo modal accesible: foco atrapado, Escape y clic fuera cierran, el foco regresa a donde estaba.
 */
export function CartDrawer() {
  const { drawerOpen, closeDrawer } = useCart();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // Se cierra al navegar (por ejemplo al ir al checkout).
  useEffect(() => closeDrawer(), [pathname, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el contenido se monta la primera vez que se abre
    setMounted(true);
    const previous = document.activeElement as HTMLElement | null;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbar}px`;
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return closeDrawer();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      previous?.focus?.();
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <div className={`fixed inset-0 z-[60] print:hidden ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen} inert={!drawerOpen}>
      <div onClick={closeDrawer} className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-300 ease-soft ${drawerOpen ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrito-lateral"
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-bg transition-[translate,box-shadow] duration-500 ease-soft ${drawerOpen ? "translate-x-0 shadow-[-24px_0_60px_-30px_rgb(34_28_23/0.5)]" : "translate-x-full"}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="carrito-lateral" className="font-serif text-2xl font-medium">Tu carrito</h2>
          <button ref={closeRef} type="button" onClick={closeDrawer} aria-label="Cerrar carrito" className="-mr-2 grid size-11 place-items-center transition-colors hover:bg-sand/60">
            <CloseIcon className="size-5" />
          </button>
        </header>
        {mounted && <DrawerContent />}
      </div>
    </div>
  );
}

function DrawerContent() {
  const { count, lastAdded, closeDrawer } = useCart();
  const { quote, loading, error } = useCartQuote();
  const [recent, setRecent] = useState(false);

  // Muestra "Agregado" unos segundos después de cada producto agregado.
  useEffect(() => {
    if (!lastAdded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aviso temporal ligado al último agregado
    setRecent(true);
    const timer = setTimeout(() => setRecent(false), 4000);
    return () => clearTimeout(timer);
  }, [lastAdded]);

  if (!loading && !count) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-sand text-fg/70"><BagIcon className="size-6" /></span>
        <p className="mt-5 font-serif text-3xl font-medium">Tu carrito está vacío.</p>
        <p className="mt-2 text-sm text-muted">Explora nuestras herramientas para seguir cultivando su matrimonio.</p>
        <ButtonLink href="/productos" size="md" className="mt-6">Ir a la tienda</ButtonLink>
      </div>
    );
  }

  return (
    <>
      {recent && (
        <p role="status" className="animate-rise flex items-center gap-2 border-b border-success/25 bg-success/10 px-5 py-3 text-sm font-medium [animation-duration:400ms] sm:px-6">
          <CheckIcon className="size-4 text-success" /> Agregado a tu carrito.
        </p>
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
        {error && <p role="alert" className="mt-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
        {loading && !quote ? (
          <p className="flex items-center gap-3 py-10 text-sm text-muted"><Spinner className="size-5" /> Calculando tu carrito…</p>
        ) : (
          <ul className="divide-y divide-border">
            {quote?.lines.map((line) => <CartLineItem key={line.productId} line={line} compact onNavigate={closeDrawer} />)}
          </ul>
        )}
      </div>
      <footer className="space-y-4 border-t border-border bg-[#fffdf9] px-5 py-5 sm:px-6">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-semibold">Subtotal</dt>
            <dd className="font-serif text-2xl font-medium lining-nums tabular-nums" aria-live="polite">{quote ? formatMoney(quote.subtotal.amount, quote.subtotal.currency) : "—"}</dd>
          </div>
          <div className="text-xs text-muted"><dt className="sr-only">Envío</dt><dd>Envío calculado en el checkout. Recolección en Chihuahua sin costo.</dd></div>
        </dl>
        <ButtonLink href="/checkout" variant="bronze" block>Finalizar compra</ButtonLink>
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link href="/carrito" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Ver carrito completo</Link>
          <button type="button" onClick={closeDrawer} className="inline-flex min-h-11 items-center text-muted hover:text-fg">Seguir comprando</button>
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-muted"><LockIcon className="size-3.5" /> Pago seguro procesado por Stripe.</p>
      </footer>
    </>
  );
}
