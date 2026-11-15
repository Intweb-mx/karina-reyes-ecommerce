import type { ReactNode } from "react";
import { StoreMockNotice } from "@/components/store/admin/StoreMockNotice";

// Panel de la tienda. Con NEXT_PUBLIC_STORE_API=http usa /api/panel/tienda/* (datos reales); sin ella, el simulador.
export default function StoreAdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StoreMockNotice />
      {children}
    </>
  );
}
