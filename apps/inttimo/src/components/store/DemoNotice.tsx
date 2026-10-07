import { getStoreApi } from "@/lib/store/api";

/** Aviso visible mientras la tienda usa el adaptador simulado: nada de lo que se ve aquí es un pedido real. */
export function DemoNotice() {
  if (getStoreApi().mode !== "mock") return null;
  return (
    <p role="note" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warning print:hidden">
      <strong className="font-semibold">Modo demostración:</strong> precios, envíos y pedidos son de ejemplo. No se realizan cobros.
    </p>
  );
}
