import type { PublicCampaign } from "@/server/presale/contract";
import { AnchorButton } from "@/components/ui/Button";
import { LockIcon } from "@/components/ui/icons";
import { phaseCopy } from "@/content/presale";
import { formatDate, formatMoney, formatShortDate } from "@/lib/format";
import { Countdown } from "../Countdown";

export function PresaleHero({ campaign, accepting }: { campaign: PublicCampaign; accepting: boolean }) {
  const copy = phaseCopy[campaign.phase];
  const open = campaign.phase === "open";

  return (
    <section id="preventa-hero" aria-labelledby="producto" className="container-page grid gap-10 pt-10 pb-16 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-20 lg:pt-20 lg:pb-24">
      <div className="animate-rise">
        <p className="flex flex-wrap items-center gap-3">
          <span className="eyebrow text-muted">Preventa</span>
          <span aria-hidden="true" className="h-px w-8 bg-border" />
          <PhaseBadge phase={campaign.phase} />
        </p>
        <h1 id="producto" className="mt-6 font-serif text-[clamp(3.25rem,9vw,6.5rem)] leading-[0.92] font-medium tracking-[-0.02em] text-balance">
          {campaign.productName}
        </h1>
        <p className="mt-6 max-w-lg font-serif text-2xl leading-snug text-fg/80 italic sm:text-3xl">{copy.lede}</p>
        {open && (
          <p className="mt-6 max-w-md leading-relaxed text-muted">
            Reserva tu lugar en unos minutos: completa tus datos{campaign.questions.length > 0 && " y un breve cuestionario"}, paga de forma segura y recibe tu folio por
            correo.
          </p>
        )}
        {campaign.deliveryNote && (
          <div className="mt-8 max-w-md border-l border-fg/30 pl-4 text-sm leading-relaxed text-fg/80">
            <p className="eyebrow mb-1 text-muted">Entrega</p>
            <p>{campaign.deliveryNote}</p>
          </div>
        )}
      </div>

      <aside
        aria-label="Resumen de la preventa"
        className="surface-ink animate-rise relative isolate bg-ink bg-[radial-gradient(120%_70%_at_100%_0%,#3a2f26_0%,transparent_60%)] p-7 text-on-ink [animation-delay:120ms] before:pointer-events-none before:absolute before:inset-2.5 before:-z-10 before:border before:border-on-ink/10 sm:p-10 lg:p-12"
      >
        {campaign.phase === "closed" ? (
          <div>
            <p className="eyebrow text-on-ink-muted">Cerró el</p>
            <p className="mt-3 font-serif text-3xl leading-tight">{formatDate(campaign.endsAt)}</p>
          </div>
        ) : (
          <>
            <Countdown
              tone="ink"
              live={open}
              target={open ? campaign.endsAt : campaign.startsAt}
              start={open ? campaign.startsAt : undefined}
              serverTime={campaign.serverTime}
              label={copy.countdownLabel!}
              description={`${open ? "La preventa cierra" : "La preventa abre"} el ${formatDate(open ? campaign.endsAt : campaign.startsAt)}.`}
            />
            <dl className="mt-6 grid grid-cols-2 gap-4 text-xs">
              {open ? (
                <>
                  <DateItem label="Abrió" iso={campaign.startsAt} />
                  <DateItem label="Cierra" iso={campaign.endsAt} align="right" />
                </>
              ) : (
                <DateItem label="Abre" iso={campaign.startsAt} />
              )}
            </dl>
          </>
        )}

        <div className="mt-8 border-t border-on-ink/15 pt-7">
          <p className="eyebrow text-on-ink-muted">Precio de preventa</p>
          <p className="mt-3 flex items-baseline gap-2.5">
            <span className="font-serif text-[clamp(2.75rem,6vw,3.75rem)] leading-none font-medium lining-nums">{formatMoney(campaign.unitAmount, campaign.currency)}</span>
            <span className="text-xs font-semibold tracking-[0.16em] text-on-ink-muted uppercase">{campaign.currency}</span>
          </p>
          <p className="mt-2 text-xs text-on-ink-muted">Pago único del precio completo.</p>
        </div>

        {accepting && (
          <AnchorButton href="#reserva" variant="inverse" block className="mt-8">
            Reservar mi lugar
          </AnchorButton>
        )}
        <p className={`${accepting ? "mt-4" : "mt-8 border-t border-on-ink/15 pt-6"} flex items-center justify-center gap-2 text-center text-xs text-on-ink-muted`}>
          <LockIcon className="size-3.5 shrink-0" />
          Pago procesado por Stripe. No guardamos datos de tu tarjeta.
        </p>
      </aside>
    </section>
  );
}

function PhaseBadge({ phase }: { phase: PublicCampaign["phase"] }) {
  const dot = phase === "open" ? "bg-success" : phase === "upcoming" ? "bg-warning" : "bg-muted";
  return (
    <span className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1 text-xs font-medium">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot} ${phase === "open" ? "motion-safe:animate-pulse" : ""}`} />
      {phaseCopy[phase].badge}
    </span>
  );
}

function DateItem({ label, iso, align = "left" }: { label: string; iso: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <dt className="text-[0.625rem] font-semibold tracking-[0.2em] text-on-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-on-ink lining-nums">
        <time dateTime={iso}>{formatShortDate(iso)}</time>
      </dd>
    </div>
  );
}
