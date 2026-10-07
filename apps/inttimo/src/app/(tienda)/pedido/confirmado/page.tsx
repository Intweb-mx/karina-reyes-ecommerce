import type { Metadata } from "next";
import { ConfirmationClient } from "@/components/store/order/ConfirmationClient";

export const metadata: Metadata = { title: "Pedido confirmado", robots: { index: false } };

export default async function PedidoConfirmadoPage({ searchParams }: PageProps<"/pedido/confirmado">) {
  const sessionId = (await searchParams).session_id;
  return (
    <main className="container-page section-y">
      <ConfirmationClient sessionId={typeof sessionId === "string" ? sessionId : null} />
    </main>
  );
}
