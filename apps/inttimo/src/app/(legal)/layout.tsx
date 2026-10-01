import type { ReactNode } from "react";
import { PresaleShell } from "@/components/layout/PresaleShell";

// Documentos legales de inttimo: públicos y permanentes, antes, durante y después de la compra.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <PresaleShell>{children}</PresaleShell>;
}
