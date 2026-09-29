import type { PublicCampaign } from "@/server/presale/contract";
import { ArrowDownIcon, LockIcon } from "@/components/ui/icons";
import { formatDate, formatMoney } from "@/lib/format";
import { Countdown } from "./Countdown";
import { MobileReserveBar } from "./MobileReserveBar";
import { ReservationForm } from "./ReservationForm";

const PHASE_LABEL: Record<PublicCampaign["phase"], string> = {
  open: "Preventa abierta",
  upcoming: "Próximamente",
  closed: "Preventa cerrada",
};

/**
 * Página de preventa (presentacional). Todo dato de negocio (nombre, precio, fechas, nota de entrega,
 * preguntas y términos) viene de la campaña; aquí solo hay texto de interfaz.
 */
export function PresaleView({ campaign, canceled }: { campaign: PublicCampaign; canceled: boolean }) {
  const price = formatMoney(campaign.unitAmount, campaign.currency);
  const open = campaign.phase === "open";
  const accepting = open && campaign.terms !== null;

  return (
    <main>
      <section id="preventa-hero" aria-labelledby="producto" className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-10 pb-16 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pt-24 lg:pb-24">
        <div className="animate-rise">
          <p className="flex flex-wrap items-center gap-3">
            <span className="eyebrow text-muted">Preventa</span>
            <span aria-hidden="true" className="h-px w-8 bg-border" />
            <PhaseBadge phase={campaign.phase} />
          </p>
          <h1 id="producto" className="mt-6 font-serif text-[clamp(3.5rem,11vw,7.5rem)] leading-[0.9] font-medium tracking-[-0.02em] text-balance">
            {campaign.productName}
          </h1>
          <p className="mt-6 max-w-lg font-serif text-2xl leading-snug text-fg/80 italic sm:text-3xl">
            {open && "Aparta el tuyo antes que nadie."}
            {campaign.phase === "upcoming" && "La preventa abre muy pronto."}
            {campaign.phase === "closed" && "La preventa ha terminado."}
          </p>
          {open && (
            <p className="mt-6 max-w-md leading-relaxed text-muted">
              Reserva tu lugar en unos minutos: completa tus datos{campaign.questions.length > 0 && " y un breve cuestionario"}, paga de forma segura y
              recibe tu folio por correo.
            </p>
          )}
          {campaign.deliveryNote && (
            <p className="mt-8 max-w-md border-l border-fg/30 pl-4 text-sm leading-relaxed text-fg/80">
              <span className="eyebrow mb-1 block text-muted">Entrega</span>
              {campaign.deliveryNote}
            </p>
          )}
        </div>

        <aside aria-label="Resumen de la preventa" className="surface-ink animate-rise bg-ink p-6 text-on-ink [animation-delay:120ms] sm:p-10">
          {open && (
            <Countdown
              tone="ink"
              target={campaign.endsAt}
              serverTime={campaign.serverTime}
              label="La preventa cierra en"
              description={`La preventa cierra el ${formatDate(campaign.endsAt)}.`}
            />
          )}
          {campaign.phase === "upcoming" && (
            <Countdown
              tone="ink"
              target={campaign.startsAt}
              serverTime={campaign.serverTime}
              label="La preventa abre en"
              description={`La preventa abre el ${formatDate(campaign.startsAt)}.`}
            />
          )}
          {campaign.phase === "closed" && (
            <div>
              <p className="eyebrow text-on-ink-muted">Cerró el</p>
              <p className="mt-3 font-serif text-3xl leading-tight">{formatDate(campaign.endsAt)}</p>
            </div>
          )}

          <p className="mt-6 text-xs text-on-ink-muted">
            {open && `Cierre: ${formatDate(campaign.endsAt)}`}
            {campaign.phase === "upcoming" && `Apertura: ${formatDate(campaign.startsAt)}`}
          </p>

          <div className="mt-8 flex items-end justify-between gap-4 border-t border-on-ink/15 pt-6">
            <div>
              <p className="eyebrow text-on-ink-muted">Precio de preventa</p>
              <p className="mt-2 font-serif text-4xl leading-none font-medium sm:text-5xl">{price}</p>
            </div>
            <p className="pb-1 text-xs tracking-[0.12em] text-on-ink-muted uppercase">{campaign.currency}</p>
          </div>

          {accepting && (
            <a
              href="#reserva"
              className="group mt-8 flex items-center justify-between gap-4 bg-on-ink px-6 py-4 text-sm font-semibold tracking-[0.16em] text-ink uppercase transition-colors duration-(--duration-base) hover:bg-sand"
            >
              Reservar mi lugar
              <ArrowDownIcon className="size-4 transition-transform duration-(--duration-base) group-hover:translate-y-0.5" />
            </a>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-on-ink-muted">
            <LockIcon className="size-3.5" />
            Pago procesado por Stripe. No guardamos datos de tu tarjeta.
          </p>
        </aside>
      </section>

      {campaign.phase !== "closed" && <HowItWorks hasQuestions={campaign.questions.length > 0} />}

      <section id="reserva" aria-labelledby="reserva-titulo" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-16 sm:px-8 sm:py-24">
        {canceled && open && (
          <p role="status" className="mb-10 flex items-start gap-3 border border-warning/30 bg-warning/5 px-5 py-4 text-sm leading-relaxed">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
            <span>
              <strong className="font-semibold">No se completó el pago.</strong> Tu lugar no quedó reservado; puedes intentarlo de nuevo cuando quieras.
            </span>
          </p>
        )}

        {accepting && campaign.terms && (
          <>
            <header className="mb-12 max-w-2xl">
              <p className="eyebrow text-muted">Reserva</p>
              <h2 id="reserva-titulo" className="mt-3 font-serif text-4xl leading-tight font-medium sm:text-5xl">
                Reserva tu lugar
              </h2>
              <p className="mt-4 leading-relaxed text-muted">Al terminar te llevaremos a Stripe para pagar. Tu lugar queda reservado cuando el pago se confirma.</p>
            </header>
            <ReservationForm campaign={campaign} />
          </>
        )}

        {open && !campaign.terms && (
          <StateMessage id="reserva-titulo" title="La preventa estará disponible en breve." body="Estamos terminando los últimos detalles. Vuelve a esta página en unos minutos." />
        )}
        {campaign.phase === "upcoming" && (
          <StateMessage
            id="reserva-titulo"
            title="La preventa aún no abre."
            body={`Abre el ${formatDate(campaign.startsAt)}; si mantienes esta página abierta, se actualizará sola al llegar la hora.`}
          />
        )}
        {campaign.phase === "closed" && <StateMessage id="reserva-titulo" title="La preventa ha cerrado." body="Gracias por tu interés. Ya no es posible reservar en esta campaña." />}
      </section>

      {accepting && <MobileReserveBar price={price} />}
    </main>
  );
}

function PhaseBadge({ phase }: { phase: PublicCampaign["phase"] }) {
  const dot = phase === "open" ? "bg-success" : phase === "upcoming" ? "bg-warning" : "bg-muted";
  return (
    <span className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1 text-xs font-medium">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot} ${phase === "open" ? "motion-safe:animate-pulse" : ""}`} />
      {PHASE_LABEL[phase]}
    </span>
  );
}

function HowItWorks({ hasQuestions }: { hasQuestions: boolean }) {
  const steps = [
    { title: "Completa tus datos", body: hasQuestions ? "Tu nombre, tu correo y un breve cuestionario." : "Tu nombre y tu correo; toma un par de minutos." },
    { title: "Paga de forma segura", body: "Pagas el precio completo en la página segura de Stripe." },
    { title: "Recibe tu folio", body: "Te enviamos un correo con tu folio de reserva. Guárdalo como comprobante." },
  ];
  return (
    <section aria-labelledby="como-funciona" className="border-y border-border/70 bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8 sm:py-16">
        <h2 id="como-funciona" className="eyebrow text-muted">
          Cómo funciona
        </h2>
        <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5 sm:block">
              <span aria-hidden="true" className="font-serif text-3xl leading-none text-fg/40 sm:text-4xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="sm:mt-5 sm:border-t sm:border-border sm:pt-5">
                <h3 className="font-serif text-2xl leading-tight font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StateMessage({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <h2 id={id} className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 leading-relaxed text-muted">{body}</p>
    </div>
  );
}
