"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { BagIcon, BookIcon, BoxIcon, ChatIcon, ClockIcon, CloseIcon, FileIcon, MenuIcon, PenIcon, SunIcon } from "@/components/ui/icons";
import { signOut } from "../auth-actions";

type Item = { href: string; label: string; hint: string; icon: ComponentType<{ className?: string }>; active: (path: string) => boolean };
type Section = { title: string; badge?: string; items: Item[] };

/**
 * Navegación del panel: barra lateral fija en computadora y menú desplegable en celular.
 * Cada opción dice para qué sirve, para que nadie tenga que adivinar dónde está cada cosa.
 */
export function PanelSidebar({ campaigns, email, storeEnabled }: { campaigns: { slug: string; name: string }[]; email: string; storeEnabled: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- cierra el menú móvil al navegar
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

  const sections: Section[] = [
    { title: "Inicio", items: [{ href: "/panel", label: "Hoy", hint: "Lo que hay que atender ahora", icon: SunIcon, active: (p) => p === "/panel" }] },
    {
      title: "Preventa",
      items: [
        { href: "/panel/pedidos", label: "Pedidos", hint: "Buscar, filtrar y descargar compras", icon: BoxIcon, active: (p) => (p.startsWith("/panel/pedidos") && p !== "/panel/pedidos/nueva") || p.startsWith("/panel/reservas") },
        { href: "/panel/pedidos/nueva", label: "Registrar venta", hint: "Ventas en persona: efectivo o transferencia", icon: BagIcon, active: (p) => p === "/panel/pedidos/nueva" },
        { href: "/panel/preventa", label: "Resumen de la preventa", hint: "Ventas, piezas disponibles y cierre", icon: FileIcon, active: (p) => p === "/panel/preventa" },
        ...campaigns.map((campaign) => ({
          href: `/panel/campanas/${campaign.slug}/editar`,
          label: campaigns.length > 1 ? `Configurar ${campaign.name}` : "Configurar preventa",
          hint: "Fechas, precio, entregas y términos",
          icon: PenIcon,
          active: (p: string) => p === `/panel/campanas/${campaign.slug}/editar`,
        })),
      ],
    },
    ...(storeEnabled
      ? [
          {
            title: "Tienda",
            badge: "Demo",
            items: [
              { href: "/panel/tienda", label: "Resumen y pedidos", hint: "Ventas y pedidos de la tienda", icon: BagIcon, active: (p: string) => p === "/panel/tienda" || p.startsWith("/panel/tienda/pedidos") },
              { href: "/panel/tienda/productos", label: "Productos e inventario", hint: "Precios, existencias y publicación", icon: FileIcon, active: (p: string) => p.startsWith("/panel/tienda/productos") },
              { href: "/panel/tienda/solicitudes", label: "Solicitudes", hint: "Mensajes de contacto e iglesias", icon: ChatIcon, active: (p: string) => p.startsWith("/panel/tienda/solicitudes") },
            ],
          },
        ]
      : []),
    {
      title: "Registro y ayuda",
      items: [
        { href: "/panel/bitacora", label: "Actividad", hint: "Quién hizo qué en el panel", icon: ClockIcon, active: (p) => p.startsWith("/panel/bitacora") },
        { href: "/panel/ayuda", label: "Cómo usar el panel", hint: "Guía paso a paso y significado de cada estado", icon: BookIcon, active: (p) => p.startsWith("/panel/ayuda") },
      ],
    },
  ];

  const current = sections.flatMap((s) => s.items).find((item) => item.active(pathname));

  const nav = (
    <nav aria-label="Secciones del panel" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 flex items-center gap-2 px-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-muted uppercase">
            {section.title}
            {section.badge && <span className="rounded-full border border-warning/40 bg-warning/15 px-1.5 py-px text-[0.625rem] tracking-normal text-warning normal-case">{section.badge}</span>}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.active(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    prefetch={false}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-start gap-3 px-3 py-2.5 transition-colors ${active ? "bg-fg text-bg" : "text-fg hover:bg-sand/70"}`}
                  >
                    <Icon className={`mt-0.5 size-[1.125rem] shrink-0 ${active ? "text-bg" : "text-fg/60 group-hover:text-fg"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm leading-5 font-medium">{item.label}</span>
                      <span className={`block text-xs leading-4 ${active ? "text-bg/70" : "text-muted"}`}>{item.hint}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-border px-5 py-4">
      <p className="truncate text-xs text-muted" title={email}>Sesión: <span className="text-fg">{email}</span></p>
      <div className="mt-3 flex items-center gap-2">
        <Link prefetch={false} href="/" target="_blank" className="inline-flex min-h-9 flex-1 items-center justify-center border border-border px-3 text-sm transition-colors hover:border-fg/40">Ver sitio</Link>
        <form action={signOut} className="flex-1">
          <button type="submit" className="inline-flex min-h-9 w-full items-center justify-center border border-border px-3 text-sm transition-colors hover:border-danger/50 hover:text-danger">Salir</button>
        </form>
      </div>
    </div>
  );

  const brand = (
    <Link prefetch={false} href="/panel" className="flex items-baseline gap-2">
      <span className="font-serif text-2xl font-medium">inttimo</span>
      <span className="text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Administración</span>
    </Link>
  );

  return (
    <>
      {/* Computadora: barra lateral fija */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-[#fbf7f1] lg:flex print:hidden">
        <div className="flex min-h-16 items-center border-b border-border px-6">{brand}</div>
        {nav}
        {footer}
      </aside>

      {/* Celular y tableta: barra superior con la sección actual y menú */}
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-[#fffdf9]/95 px-4 backdrop-blur-md lg:hidden print:hidden">
        <div className="min-w-0">
          {brand}
          {current && <p className="-mt-0.5 truncate text-xs text-muted">{current.label}</p>}
        </div>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="menu-panel" className="inline-flex min-h-11 items-center gap-2 border border-border px-3 text-sm font-medium">
          <MenuIcon className="size-5" /> Menú
        </button>
      </header>

      <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
        <div id="menu-panel" role="dialog" aria-modal="true" aria-label="Menú del panel" className={`absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[#fbf7f1] transition-transform duration-300 ease-soft ${open ? "translate-x-0 shadow-[24px_0_60px_-30px_rgb(34_28_23/0.5)]" : "-translate-x-full"}`}>
          <div className="flex min-h-14 items-center justify-between border-b border-border px-5">
            {brand}
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="grid size-11 place-items-center"><CloseIcon className="size-5" /></button>
          </div>
          {nav}
          {footer}
        </div>
      </div>
    </>
  );
}
