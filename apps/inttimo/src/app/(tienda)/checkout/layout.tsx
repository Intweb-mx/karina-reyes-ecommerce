import type { ReactNode } from "react";
import { StoreClosed, WhenStoreOpen } from "@/components/store/StoreClosed";

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <WhenStoreOpen closed={<StoreClosed eyebrow="Compra" title="La compra en línea abre pronto." body="Estamos terminando de preparar la tienda. Por ahora puedes conocer UNO+UNO y escribirnos si tienes dudas." />}>{children}</WhenStoreOpen>
  );
}
