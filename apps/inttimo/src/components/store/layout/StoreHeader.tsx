"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/layout/Wordmark";
import { ButtonLink } from "@/components/ui/Button";
import { BagIcon, CloseIcon, MenuIcon, UserIcon } from "@/components/ui/icons";
import { nav } from "@/content/store";
import { useCart } from "../cart/CartProvider";

/** Header global de la tienda (CLAUDE.md §9): navegación, cuenta, carrito con contador y CTA. Menú plegable en móvil. */
export function StoreHeader() {
  const pathname = usePathname();
  const { count, ready, openDrawer, drawerOpen } = useCart();
  const [open, setOpen] = useState(false);

  // Cierra el menú al cambiar de página y con Escape.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la navegación
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header style={{ viewTransitionName: "store-header" }} className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 print:static">
      <div className="container-page flex h-(--header-height) items-center justify-between gap-4">
        <Link href="/" aria-label="inttimo, inicio" className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={`relative px-3 py-2 text-sm transition-colors ${active(item.href) ? "text-fg" : "text-fg/70 hover:text-fg"}`}
            >
              {item.label}
              {active(item.href) && <span aria-hidden="true" className="absolute inset-x-3 -bottom-0.5 h-px bg-bronze" />}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link href="/cuenta" aria-label="Mi cuenta" className="grid size-11 place-items-center text-fg/80 transition-colors hover:text-fg">
            <UserIcon className="size-5" />
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-label={`Abrir carrito${ready && count ? `, ${count} ${count === 1 ? "producto" : "productos"}` : ", vacío"}`}
            className="relative grid size-11 place-items-center text-fg/80 transition-colors hover:text-fg"
          >
            <BagIcon className="size-5" />
            {ready && count > 0 && (
              <span key={count} aria-hidden="true" className="animate-pop absolute top-1.5 right-1 grid min-w-5 place-items-center rounded-full bg-bronze px-1 text-[0.625rem] leading-5 font-semibold text-on-ink lining-nums">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
          <span className="ml-2 hidden sm:block">
            <ButtonLink href="/productos" size="sm" arrow={false}>
              Ir a la tienda
            </ButtonLink>
          </span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="menu-movil"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="grid size-11 place-items-center lg:hidden"
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="menu-movil" aria-label="Principal" className="animate-rise border-t border-border bg-bg [animation-duration:300ms] lg:hidden">
          <ul className="container-page py-4">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`flex min-h-13 items-center border-b border-border/70 font-serif text-2xl ${active(item.href) ? "text-fg" : "text-fg/80"}`}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-3 pt-5">
              <Link href="/ayuda" className="text-sm text-muted underline underline-offset-4">Ayuda</Link>
              <Link href="/rastrear-pedido" className="text-sm text-muted underline underline-offset-4">Rastrear pedido</Link>
              <Link href="/contacto" className="text-sm text-muted underline underline-offset-4">Contacto</Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
