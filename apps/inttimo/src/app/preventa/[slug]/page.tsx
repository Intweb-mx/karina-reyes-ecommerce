import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Countdown } from "@/components/presale/Countdown";
import { ReservationForm } from "@/components/presale/ReservationForm";
import { formatDate, formatMoney } from "@/lib/format";
import { getPublicCampaign } from "@/server/presale/reservations";
import { getDb } from "@/server/presale/runtime";

async function loadCampaign(slug: string) {
  await connection();
  const result = await getPublicCampaign({ db: getDb() }, slug);
  if (!result.ok) notFound();
  return result.data;
}

export async function generateMetadata({ params }: PageProps<"/preventa/[slug]">): Promise<Metadata> {
  const campaign = await loadCampaign((await params).slug);
  return { title: `Preventa ${campaign.productName}` };
}

export default async function PresalePage({ params, searchParams }: PageProps<"/preventa/[slug]">) {
  const campaign = await loadCampaign((await params).slug);
  const canceled = (await searchParams).cancelado === "1";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-8 sm:py-20">
      <header className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          <p className="text-xs tracking-[0.25em] text-muted uppercase">Preventa</p>
          <h1 className="mt-4 font-serif text-5xl leading-none sm:text-7xl">{campaign.productName}</h1>
          <p className="mt-6 font-serif text-2xl">{formatMoney(campaign.unitAmount, campaign.currency)}</p>
          {campaign.deliveryNote && <p className="mt-3 max-w-md text-muted">{campaign.deliveryNote}</p>}
        </div>

        {campaign.phase === "open" && (
          <Countdown target={campaign.endsAt} serverTime={campaign.serverTime} label={`La preventa cierra el ${formatDate(campaign.endsAt)}`} />
        )}
        {campaign.phase === "upcoming" && (
          <Countdown target={campaign.startsAt} serverTime={campaign.serverTime} label={`La preventa abre el ${formatDate(campaign.startsAt)}`} />
        )}
      </header>

      <section className="mt-16 border-t border-border pt-12" aria-labelledby="reserva">
        {canceled && campaign.phase === "open" && (
          <p role="status" className="mb-8 border border-border bg-surface px-4 py-3 text-sm">
            No se completó el pago. Tu lugar no quedó reservado; puedes intentarlo de nuevo.
          </p>
        )}

        {campaign.phase === "open" && !campaign.terms && (
          <h2 id="reserva" className="font-serif text-3xl">La preventa estará disponible en breve.</h2>
        )}
        {campaign.phase === "open" && campaign.terms && (
          <div className="max-w-2xl">
            <h2 id="reserva" className="font-serif text-3xl">Reserva tu lugar</h2>
            <p className="mt-2 mb-10 text-muted">Completa tus datos y el cuestionario. Al final pagarás en Stripe.</p>
            <ReservationForm campaign={campaign} />
          </div>
        )}
        {campaign.phase === "upcoming" && (
          <h2 id="reserva" className="font-serif text-3xl">La preventa aún no abre.</h2>
        )}
        {campaign.phase === "closed" && (
          <h2 id="reserva" className="font-serif text-3xl">La preventa ha cerrado.</h2>
        )}
      </section>
    </main>
  );
}
