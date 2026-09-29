import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/server/auth/admin";
import { signOut } from "../auth-actions";

export default async function PanelAppLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/panel" className="font-serif text-lg">inttimo · panel</Link>
            <Link href="/panel" className="text-muted hover:text-fg">Campañas</Link>
            <Link href="/panel/bitacora" className="text-muted hover:text-fg">Bitácora</Link>
          </nav>
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="text-muted">{admin.email}</span>
            <button type="submit" className="underline underline-offset-4">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
