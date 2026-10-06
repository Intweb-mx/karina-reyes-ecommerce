import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/server/auth/admin";
import { signOut } from "../auth-actions";
import { PanelNav } from "./PanelNav";

export default async function PanelAppLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <a href="#panel-contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-[#fffdf9]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href="/panel" className="flex min-h-14 items-baseline gap-2">
              <span className="font-serif text-xl font-medium">inttimo</span>
              <span className="hidden text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase sm:inline">Administración</span>
            </Link>
            <PanelNav />
          </div>
          <form action={signOut} className="flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden max-w-56 truncate text-muted sm:inline" title={admin.email}>
              {admin.email}
            </span>
            <button type="submit" className="inline-flex min-h-9 items-center border border-border px-3 text-sm transition-colors hover:border-fg/40">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main id="panel-contenido" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
