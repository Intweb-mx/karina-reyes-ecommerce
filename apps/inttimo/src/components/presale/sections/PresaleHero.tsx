import Image from "next/image";
import type { PublicCampaign } from "@/server/presale/contract";
import type { ProductContent } from "@/content/products";
import { AnchorButton } from "@/components/ui/Button";
import { BoxIcon, CalendarIcon, GemIcon, GiftIcon, HeartIcon, LeafIcon, LockIcon, MailIcon, PeopleIcon } from "@/components/ui/icons";
import { phaseCopy, stateCopy, trust } from "@/content/presale";
import { formatCalendarDate, formatDate, formatDateRange, formatMoney } from "@/lib/format";
import { Countdown } from "../Countdown";

const BENEFIT_ICONS = { heart: HeartIcon, people: PeopleIcon, leaf: LeafIcon, gem: GemIcon };
const TRUST_ICONS = { lock: LockIcon, mail: MailIcon, box: BoxIcon };

/**
 * Primera pantalla: fotografía protagonista a sangre (mitad derecha) que se funde con el crema,
 * texto + beneficios + CTA de compra a la izquierda y panel claro (contador + precio) flotando sobre la foto.
 * Sin contenido de producto se muestra solo texto y panel.
 */
export function PresaleHero({ campaign, product, accepting }: { campaign: PublicCampaign; product: ProductContent | null; accepting: boolean }) {
  const copy = phaseCopy[campaign.phase];
  const open = campaign.phase === "open";
  const soldOut = open && campaign.soldOut;
  const photo = product?.hero;

  return (
    <section id="preventa-hero" aria-labelledby="producto" className="relative isolate overflow-hidden">
      {/* Fotografía a sangre en escritorio, con degradado hacia el crema para que el texto respire. */}
      {photo && (
        <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 hidden w-[46%] lg:block xl:w-[58%]">
          <Image src={photo.src} alt="" fill priority sizes="58vw" className="animate-hero-settle object-cover object-[35%_55%]" />
          <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg/60 to-transparent" />
          {photo.placeholder && <PlaceholderTag className="top-5 right-5" />}
        </div>
      )}

      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-8 pt-7 pb-4 sm:pt-12 sm:pb-12 lg:min-h-[min(46rem,calc(100dvh-var(--header-height)))] lg:grid-cols-12 lg:content-center lg:gap-x-8 lg:gap-y-0 lg:py-16">
        {/* Encabezado (en móvil va antes de la foto, para ver producto y precio desde la primera pantalla) */}
        <div className="animate-rise order-1 lg:col-span-6 lg:row-start-1 lg:self-end xl:col-span-5">
          <p className="inline-flex items-center overflow-hidden rounded-full border border-border bg-surface/90 text-[0.6875rem] whitespace-nowrap shadow-[0_1px_2px_rgb(34_28_23/0.05)] backdrop-blur sm:text-xs">
            <span className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5">
              <CalendarIcon className="size-3.5 text-muted" />
              <span className="font-semibold tracking-[0.1em] uppercase sm:tracking-[0.18em]">
                Preventa<span className="max-[359px]:hidden"> exclusiva</span>
              </span>
            </span>
            <span className="border-l border-border px-3 py-1.5 font-medium lining-nums sm:px-3.5">{formatDateRange(campaign.startsAt, campaign.endsAt)}</span>
          </p>

          <h1 id="producto" className="mt-5 font-serif sm:mt-7 text-[clamp(3.5rem,8vw,6rem)] leading-[0.9] font-medium tracking-[-0.02em] text-balance">
            {campaign.productName}
          </h1>
          <p className="mt-3 font-serif text-[clamp(1.625rem,3vw,2.25rem)] leading-[1.1] text-fg/85 italic">{product?.tagline ?? copy.lede}</p>
        </div>

        {/* Texto, beneficios y acción principal */}
        <div className="animate-rise order-3 lg:order-none lg:col-span-6 lg:row-start-2 lg:self-start xl:col-span-5">

          {product?.intro.map((paragraph, index) => (
            <p key={index} className={`max-w-lg leading-relaxed ${index === 0 ? "text-fg/80 lg:mt-6" : "mt-3 text-muted"}`}>
              {paragraph}
            </p>
          ))}

          {product && (
            <ul
              aria-label="Beneficios"
              // Enfocable para poder desplazar la fila con teclado en móvil (axe: scrollable-region-focusable).
              tabIndex={0}
              className="-mx-4 mt-7 flex focus-visible:outline-offset-[-2px] snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:grid sm:grid-cols-4 sm:gap-x-4 sm:gap-y-5 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {product.benefits.map((benefit) => {
                const Icon = BENEFIT_ICONS[benefit.icon];
                return (
                  <li
                    key={benefit.title}
                    className="flex shrink-0 snap-start items-center gap-2 rounded-full border border-border bg-surface/80 py-1.5 pr-4 pl-1.5 sm:flex-col sm:items-start sm:gap-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-sand/80 text-fg/75 sm:size-11">
                      <Icon className="size-4 sm:size-5" />
                    </span>
                    <span className="text-[0.8125rem] leading-snug font-medium whitespace-nowrap sm:whitespace-normal">{benefit.title}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 sm:mt-8">
            {product?.launchDate ? (
              <p className="flex items-center gap-3">
                <CalendarIcon className="size-6 text-fg/60" />
                <span>
                  <span className="block text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Lanzamiento oficial</span>
                  <span className="block text-sm font-medium lining-nums">{formatCalendarDate(product.launchDate)}</span>
                </span>
              </p>
            ) : (
              <span />
            )}
            <PhaseBadge phase={campaign.phase} soldOut={soldOut} />
          </div>

          {campaign.deliveryNote && <p className="mt-5 max-w-md border-l border-fg/30 pl-4 text-sm leading-relaxed text-fg/80">{campaign.deliveryNote}</p>}

          {accepting && (
            <>
              {/* En móvil el panel del contador y la barra fija ya llevan el CTA: este solo aparece en escritorio. */}
              <AnchorButton href="#reserva" variant="bronze" arrow="right" block className="mt-6 max-lg:hidden">
                {`Quiero mi ${campaign.productName}`}
              </AnchorButton>
              <ul aria-label="Garantías" className="mt-6 grid grid-cols-3 gap-2 lg:mt-4 lg:gap-3">
                {trust.map((item) => {
                  const Icon = TRUST_ICONS[item.key];
                  return (
                    <li key={item.key} className="flex flex-col items-center gap-1.5 text-center text-[0.6875rem] leading-tight text-muted lg:flex-row lg:gap-2 lg:text-left">
                      <Icon className="size-4 shrink-0" />
                      {item.title}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Foto (móvil) + panel del contador */}
        <div className="relative order-2 lg:order-none lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:self-center xl:col-span-5 xl:col-start-8">
          {photo && (
            <div className="relative -mx-4 aspect-[4/3] overflow-hidden bg-sand sm:mx-0 sm:aspect-[5/4] lg:hidden">
              <Image src={photo.src} alt={photo.alt} fill priority sizes="100vw" className="animate-hero-settle object-cover object-[35%_55%]" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg to-transparent" />
              {photo.placeholder && <PlaceholderTag />}
            </div>
          )}

          <aside
            aria-label="Resumen de la preventa"
            className={`animate-rise relative z-10 border border-white/60 bg-[#fffdf9]/95 p-7 shadow-[0_40px_80px_-36px_rgb(34_28_23/0.55),0_12px_28px_-16px_rgb(34_28_23/0.3)] backdrop-blur-md [animation-delay:160ms] max-sm:p-6 sm:p-8 ${
              photo ? "mx-1 -mt-20 sm:mx-auto sm:-mt-28 sm:max-w-md lg:mx-0 lg:mt-0 lg:ml-auto lg:w-[22rem] xl:w-[23.5rem]" : ""
            }`}
          >
            {soldOut ? (
              <div role="status">
                <p className="eyebrow text-muted">{`Preventa ${campaign.productName}`}</p>
                <p className="mt-5 font-serif text-[clamp(2.75rem,6vw,3.5rem)] leading-none font-medium">{stateCopy.soldOutCard.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{stateCopy.soldOutCard.body}</p>
              </div>
            ) : campaign.phase === "closed" ? (
              <div>
                <p className="eyebrow text-muted">Cerró el</p>
                <p className="mt-3 font-serif text-3xl leading-tight">{formatDate(campaign.endsAt)}</p>
              </div>
            ) : (
              <Countdown
                live={open}
                heading={`Preventa ${campaign.productName}`}
                label={copy.countdownLabel!}
                target={open ? campaign.endsAt : campaign.startsAt}
                serverTime={campaign.serverTime}
                description={`${open ? "La preventa cierra" : "La preventa abre"} el ${formatDate(open ? campaign.endsAt : campaign.startsAt)}.`}
              />
            )}

            <div className="mt-7 border-t border-border pt-6">
              <p className="eyebrow text-muted">Precio de preventa</p>
              <p className="mt-3 flex items-baseline gap-2.5">
                <span className="font-serif text-[clamp(2.75rem,5vw,3.5rem)] leading-none font-medium lining-nums">{formatMoney(campaign.unitAmount, campaign.currency)}</span>
                <span className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{campaign.currency}</span>
              </p>
              {product?.bonus && !soldOut && (
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <GiftIcon className="size-4 shrink-0 text-bronze" />
                  {product.bonus.short}
                </p>
              )}
            </div>

            {accepting && (
              <AnchorButton href="#reserva" variant="bronze" arrow="right" block className="mt-7">
                Quiero el mío
              </AnchorButton>
            )}
            <p className={`${accepting ? "mt-4" : "mt-7 border-t border-border pt-5"} flex items-center justify-center gap-2 text-center text-xs text-muted`}>
              <LockIcon className="size-3.5 shrink-0" />
              Pago seguro procesado por Stripe.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function PhaseBadge({ phase, soldOut }: { phase: PublicCampaign["phase"]; soldOut?: boolean }) {
  const dot = soldOut ? "bg-danger" : phase === "open" ? "bg-success" : phase === "upcoming" ? "bg-warning" : "bg-muted";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot} ${phase === "open" && !soldOut ? "motion-safe:animate-pulse" : ""}`} />
      {soldOut ? stateCopy.soldOutCard.badge : phaseCopy[phase].badge}
    </span>
  );
}

/** Aviso visible solo en desarrollo: la foto es un render de referencia, no el asset final. */
export function PlaceholderTag({ className = "top-3 left-3" }: { className?: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return <span className={`absolute bg-warning px-2 py-1 text-[0.625rem] font-semibold tracking-[0.14em] text-on-ink uppercase ${className}`}>Foto de referencia</span>;
}
