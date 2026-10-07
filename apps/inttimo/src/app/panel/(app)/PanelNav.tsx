"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { storeEnabled } from "@/lib/store/flags";

const LINKS = [
  { href: "/panel", label: "Pedidos", match: (p: string) => p === "/panel" || p.startsWith("/panel/campanas") || p.startsWith("/panel/reservas") },
  // La tienda completa solo aparece donde está habilitada (desarrollo o NEXT_PUBLIC_STORE_ENABLED=1).
  ...(storeEnabled ? [{ href: "/panel/tienda", label: "Tienda", match: (p: string) => p.startsWith("/panel/tienda") }] : []),
  { href: "/panel/bitacora", label: "Actividad", match: (p: string) => p.startsWith("/panel/bitacora") },
];

/** Navegación del panel con la sección actual marcada. */
export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex min-h-14 items-center px-2.5 text-sm sm:px-3 font-medium transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {link.label}
            {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 bg-bronze" />}
          </Link>
        );
      })}
    </nav>
  );
}
