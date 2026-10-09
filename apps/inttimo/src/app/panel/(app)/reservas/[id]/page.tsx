import { permanentRedirect } from "next/navigation";

/** Ruta anterior del detalle del pedido: se conserva para enlaces guardados. */
export default async function LegacyReservationPage({ params }: PageProps<"/panel/reservas/[id]">) {
  permanentRedirect(`/panel/pedidos/${(await params).id}`);
}
