import type { PublicCampaign } from "@/server/presale/contract";
import { Notice } from "@/components/ui/Notice";
import { getProductContent } from "@/content/products";
import { formCopy, stateCopy } from "@/content/presale";
import { daysBetween, formatCalendarDate, formatDate, formatMoney, formatShortDate } from "@/lib/format";
import { ReservationForm } from "./form/ReservationForm";
import { StickyBuyBar } from "./StickyBuyBar";
import { HowItWorks } from "./sections/HowItWorks";
import { PresaleBonus } from "./sections/PresaleBonus";
import { PresaleHero } from "./sections/PresaleHero";
import { ProductIncludes } from "./sections/ProductIncludes";
import { StateMessage } from "./sections/StateMessage";

/**
 * Landing de preventa de producto (brief "Cambios preventa UNO+UNO"):
 * hero (foto, beneficios, contador) → qué incluye + bonus → cómo funciona → checkout a todo lo ancho.
 * Precio, fechas, cantidad, preguntas y términos vienen de la campaña; el contenido del producto, de src/content/products.ts.
 */
export function PresaleView({ campaign, canceled }: { campaign: PublicCampaign; canceled: boolean }) {
  const product = getProductContent(campaign.slug);
  const open = campaign.phase === "open";
  const accepting = open && campaign.terms !== null && !campaign.soldOut;

  const howItWorks = (
    <HowItWorks
      productName={campaign.productName}
      maxQuantity={campaign.maxQuantityPerReservation}
      days={daysBetween(campaign.startsAt, campaign.endsAt)}
      launch={product?.launchDate ? formatCalendarDate(product.launchDate) : undefined}
    />
  );

  return (
    <main>
      <PresaleHero campaign={campaign} product={product} accepting={accepting} />

      {accepting ? (
        <>
          {/* Producto: qué incluye + bonus lado a lado */}
          {product && (product.includes || product.bonus) && (
            <div className="container-page section-y grid gap-8 lg:grid-cols-2 lg:gap-10">
              {product.includes && <ProductIncludes includes={product.includes} />}
              {product.bonus && <PresaleBonus bonus={product.bonus} />}
            </div>
          )}

          <div className="container-page pb-16 sm:pb-20">{howItWorks}</div>

          {/* Checkout a todo lo ancho, en su propia banda */}
          <section id="reserva" aria-labelledby="reserva-titulo" className="scroll-mt-20 border-t border-border bg-surface">
            <div className="container-page section-y">
              {canceled && (
                <Notice tone="warning" role="status" title="No se completó el pago." className="mx-auto mb-10 max-w-2xl">
                  {stateCopy.canceled}
                </Notice>
              )}
              <header className="mx-auto mb-10 max-w-2xl text-center">
                <p className="eyebrow text-muted">{formCopy.eyebrow}</p>
                <h2 id="reserva-titulo" className="mt-3 font-serif text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.02] font-medium">
                  {formCopy.title(campaign.productName)}
                </h2>
                <p className="mt-4 leading-relaxed text-muted">{formCopy.intro}</p>
              </header>
              <ReservationForm campaign={campaign} product={product} />
            </div>
          </section>
        </>
      ) : (
        <>
          {product && campaign.phase !== "closed" && (
            <div className="container-page section-y grid gap-10 lg:grid-cols-2">
              {product.includes && <ProductIncludes includes={product.includes} />}
              {product.bonus && <PresaleBonus bonus={product.bonus} />}
            </div>
          )}
          <section id="reserva" aria-labelledby="reserva-titulo" className="container-page section-y border-t border-border/70">
            {open && campaign.soldOut && <StateMessage id="reserva-titulo" {...stateCopy.soldOut} />}
            {open && !campaign.terms && !campaign.soldOut && <StateMessage id="reserva-titulo" {...stateCopy.notReady} />}
            {campaign.phase === "upcoming" && <StateMessage id="reserva-titulo" {...stateCopy.upcoming(formatDate(campaign.startsAt))} />}
            {campaign.phase === "closed" && <StateMessage id="reserva-titulo" {...stateCopy.closed} />}
          </section>
          {campaign.phase === "upcoming" && <div className="container-page pb-24">{howItWorks}</div>}
        </>
      )}

      {accepting && (
        <StickyBuyBar
          productName={campaign.productName}
          tagline={product?.tagline}
          thumbnail={product?.thumbnail.src}
          price={formatMoney(campaign.unitAmount, campaign.currency)}
          currency={campaign.currency}
          closes={formatShortDate(campaign.endsAt)}
        />
      )}
    </main>
  );
}
