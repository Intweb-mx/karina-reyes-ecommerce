import type { ReactNode } from "react";
import { StoreClosed, WhenStoreOpen } from "@/components/store/StoreClosed";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <WhenStoreOpen closed={<StoreClosed eyebrow="Mi cuenta" title="Mi cuenta estará disponible pronto." body="Podrás ver tus pedidos y direcciones cuando abra la tienda." />}>{children}</WhenStoreOpen>
  );
}
