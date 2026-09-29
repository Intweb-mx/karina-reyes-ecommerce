import type { PublicCampaign } from "@/server/presale/contract";
import { Notice } from "@/components/ui/Notice";
import { formCopy, stateCopy } from "@/content/presale";
import { formatDate, formatMoney } from "@/lib/format";
import { ReservationForm } from "./form/ReservationForm";
import { MobileReserveBar } from "./MobileReserveBar";
import { HowItWorks } from "./sections/HowItWorks";
import { PresaleHero } from "./sections/PresaleHero";
import { StateMessage } from "./sections/StateMessage";

/**
 * Página de preventa (composición). Todo dato de negocio (nombre, precio, fechas, nota de entrega,
 * preguntas y términos) viene de la campaña; los textos de interfaz viven en src/content/presale.ts.
 */
export function PresaleView({ campaign, canceled }: { campaign: PublicCampaign; canceled: boolean }) {
  const open = campaign.phase === "open";
  const accepting = open && campaign.terms !== null;

  return (
    <main>
      <PresaleHero campaign={campaign} accepting={accepting} />

      {campaign.phase !== "closed" && <HowItWorks hasQuestions={campaign.questions.length > 0} />}

      <section id="reserva" aria-labelledby="reserva-titulo" className="container-page section-y scroll-mt-6">
        {canceled && open && (
          <Notice tone="warning" role="status" title="No se completó el pago." className="mb-10">
            {stateCopy.canceled}
          </Notice>
        )}

        {accepting && (
          <>
            <header className="mb-12 max-w-2xl">
              <p className="eyebrow text-muted">Reserva</p>
              <h2 id="reserva-titulo" className="mt-3 font-serif text-4xl leading-tight font-medium sm:text-5xl">
                {formCopy.title}
              </h2>
              <p className="mt-4 leading-relaxed text-muted">{formCopy.intro}</p>
            </header>
            <ReservationForm campaign={campaign} />
          </>
        )}

        {open && !campaign.terms && <StateMessage id="reserva-titulo" {...stateCopy.notReady} />}
        {campaign.phase === "upcoming" && <StateMessage id="reserva-titulo" {...stateCopy.upcoming(formatDate(campaign.startsAt))} />}
        {campaign.phase === "closed" && <StateMessage id="reserva-titulo" {...stateCopy.closed} />}
      </section>

      {accepting && <MobileReserveBar price={formatMoney(campaign.unitAmount, campaign.currency)} />}
    </main>
  );
}
