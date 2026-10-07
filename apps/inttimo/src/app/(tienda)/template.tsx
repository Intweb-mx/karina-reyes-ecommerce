import type { ReactNode } from "react";
import { PageTransition } from "@/components/store/layout/PageTransition";

// El template se vuelve a montar en cada navegación: eso dispara la transición de entrada/salida.
export default function StoreTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
