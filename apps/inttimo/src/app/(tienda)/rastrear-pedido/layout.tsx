import type { ReactNode } from "react";
import { StoreClosed, WhenStoreOpen } from "@/components/store/StoreClosed";

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return (
    <WhenStoreOpen closed={<StoreClosed eyebrow="Rastreo" title="El rastreo de pedidos estará disponible pronto." body="Si ya compraste, escríbenos con tu número de pedido y te ayudamos." />}>{children}</WhenStoreOpen>
  );
}
