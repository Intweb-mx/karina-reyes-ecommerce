import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreShell } from "@/components/store/layout/StoreShell";
import { requireStore } from "@/lib/store/flags";

// Tienda inttimo (Fase 2). Oculta en producción hasta su aprobación: ver src/lib/store/flags.ts.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StoreLayout({ children }: { children: ReactNode }) {
  requireStore();
  return <StoreShell>{children}</StoreShell>;
}
