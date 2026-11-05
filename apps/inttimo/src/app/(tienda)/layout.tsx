import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreShell } from "@/components/store/layout/StoreShell";
import { requireSite } from "@/lib/store/flags";

// Sitio inttimo (Fase 2). Oculto en producción hasta habilitarlo; la compra se abre aparte: ver src/lib/store/flags.ts.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StoreLayout({ children }: { children: ReactNode }) {
  requireSite();
  return <StoreShell>{children}</StoreShell>;
}
