import type { ReactNode } from "react";
import { StoreClosed, WhenBackendReady } from "@/components/store/StoreClosed";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <WhenBackendReady closed={<StoreClosed eyebrow="Mi cuenta" title="Mi cuenta estará disponible pronto." body="Muy pronto podrás ver aquí tus pedidos y direcciones." />}>{children}</WhenBackendReady>
  );
}
