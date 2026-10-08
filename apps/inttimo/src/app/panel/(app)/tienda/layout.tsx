import type { ReactNode } from "react";
import { StoreMockNotice } from "@/components/store/admin/StoreMockNotice";
import { requireStore } from "@/lib/store/flags";

// Panel de la tienda completa: oculto en producción hasta su aprobación, igual que la tienda (src/lib/store/flags.ts).
export default function StoreAdminLayout({ children }: { children: ReactNode }) {
  requireStore();
  return (
    <>
      <StoreMockNotice />
      {children}
    </>
  );
}
