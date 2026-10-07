"use client";

import { getStoreAdminApi } from "@/lib/store/admin";

/** Aviso de datos simulados en el panel de la tienda mientras no exista el backend. */
export function StoreMockNotice() {
  if (getStoreAdminApi().mode !== "mock") return null;
  return (
    <p className="mb-8 border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
      <strong>Modo demostración:</strong> pedidos, clientes e inventario son de EJEMPLO y los cambios se pierden al recargar. Se conectará al backend de la tienda cuando esté listo.
    </p>
  );
}
