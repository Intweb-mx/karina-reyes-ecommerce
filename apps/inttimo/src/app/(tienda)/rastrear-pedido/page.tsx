import type { Metadata } from "next";
import { PageHero } from "@/components/store/PageHero";
import { TrackOrder } from "@/components/store/order/TrackOrder";

export const metadata: Metadata = { title: "Rastrear pedido" };

export default async function RastrearPage({ searchParams }: PageProps<"/rastrear-pedido">) {
  const pedido = (await searchParams).pedido;
  return (
    <main>
      <PageHero eyebrow="Rastrea tu pedido" title={<>Tu pedido, <em className="font-normal">en camino</em>.</>} body="Consulta en todo momento dónde va tu pedido con tu número de pedido y tu correo." size="sm" />
      <div className="container-page -mt-6 pb-20 sm:-mt-10">
        <TrackOrder initialOrderNumber={typeof pedido === "string" ? pedido.slice(0, 40) : ""} />
      </div>
    </main>
  );
}
