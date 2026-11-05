import type { ReactNode } from "react";
import { StoreClosed, WhenStoreOpen } from "@/components/store/StoreClosed";

export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <WhenStoreOpen closed={<StoreClosed eyebrow="Pedido" title="Aquí verás la confirmación de tu pedido." body="La compra en línea aún no está abierta. Si ya compraste, escríbenos con tu número de pedido." />}>{children}</WhenStoreOpen>
  );
}
