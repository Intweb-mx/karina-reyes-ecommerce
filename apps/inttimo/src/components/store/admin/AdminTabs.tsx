"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoreAdminApi } from "@/lib/store/admin";

const TABS = [
  { href: "/panel/tienda", label: "Resumen y pedidos", match: (p: string) => p === "/panel/tienda" || p.startsWith("/panel/tienda/pedidos") },
  { href: "/panel/tienda/productos", label: "Productos e inventario", match: (p: string) => p.startsWith("/panel/tienda/productos") },
  { href: "/panel/tienda/solicitudes", label: "Solicitudes", match: (p: string) => p.startsWith("/panel/tienda/solicitudes") },
];

/** Pestañas del panel de la tienda + aviso de datos simulados mientras no exista el backend. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-8 space-y-4">
      {getStoreAdminApi().mode === "mock" && (
        <p className="border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <strong>Modo demostración:</strong> pedidos, clientes e inventario son de EJEMPLO y los cambios se pierden al recargar. Se conectará al backend de la tienda cuando esté listo.
        </p>
      )}
      <nav aria-label="Secciones de la tienda" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.href}>
                <Link href={tab.href} aria-current={active ? "page" : undefined} className={`relative inline-flex min-h-11 items-center px-3 text-sm font-medium transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}>
                  {tab.label}
                  {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 bg-bronze" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
