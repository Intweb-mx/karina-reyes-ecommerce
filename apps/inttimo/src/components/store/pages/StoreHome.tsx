import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PlaceholderTag } from "@/components/presale/sections/PresaleHero";
import { brand } from "@/content/store";
import { getProductContent } from "@/content/products";
import { getStoreApi } from "@/lib/store/api";
import { formatMoney } from "@/lib/format";
import { TerritoryGrid, TrustStrip } from "../Blocks";
import { PageHero, SectionHeading } from "../PageHero";

/** 01 · Home: marca primero, territorios, UNO+UNO como primer producto, confianza y acceso a tienda. */
export async function StoreHome() {
  const content = getProductContent("uno-mas-uno")!;
  const result = await getStoreApi().product("uno-mas-uno");
  const product = result.ok ? result.data : null;

  return (
    <main>
      <PageHero
        tone="dark"
        size="lg"
        eyebrow="inttimo"
        title={<>El matrimonio se <em className="font-normal">cultiva</em>.</>}
        body={brand.promise}
        image={content.hero}
        actions={
          <>
            <ButtonLink href="/para-matrimonios" variant="inverse">Explora cómo</ButtonLink>
            <ButtonLink href="/productos" variant="outline" arrow={false} className="border-on-ink/60 text-on-ink before:bg-on-ink hover:text-ink">Ir a la tienda</ButtonLink>
          </>
        }
      />

      <section className="container-page section-y">
        <Reveal>
          <SectionHeading eyebrow="Explora por temas" title="¿Qué quieren cultivar juntos?" body="Encuentren herramientas para cada etapa de su historia." />
        </Reveal>
        <div className="mt-12">
          <TerritoryGrid linkTo="/para-matrimonios" />
        </div>
      </section>

      {product && (
        <section aria-labelledby="primer-producto" className="surface-ink grid bg-ink text-on-ink lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Reveal className="flex flex-col justify-center px-6 py-14 sm:px-12 lg:py-20 xl:px-20">
            <p className="eyebrow text-on-ink-muted">Nuestro primer juego</p>
            <h2 id="primer-producto" className="mt-4 font-serif text-[clamp(3rem,6vw,4.75rem)] leading-none font-medium">{product.name}</h2>
            <p className="mt-3 font-serif text-2xl text-on-ink/85 italic">{product.tagline}</p>
            <p className="mt-5 max-w-md leading-relaxed text-on-ink-muted">{product.description[1] ?? product.description[0]}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <ButtonLink href={`/productos/${product.slug}`} variant="inverse">Conoce {product.name}</ButtonLink>
              {product.price && <p className="font-serif text-3xl lining-nums">{formatMoney(product.price.amount, product.price.currency)}</p>}
            </div>
          </Reveal>
          <div className="relative min-h-80 lg:min-h-[34rem]">
            <Image src={content.includes!.image.src} alt={content.includes!.image.alt} fill sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
            {content.includes!.image.placeholder && <PlaceholderTag />}
          </div>
        </section>
      )}

      <section className="container-page section-y">
        <div className="grid gap-10 border border-border bg-surface p-8 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="eyebrow text-muted">Una compra con propósito</p>
            <div className="mt-6">
              <TrustStrip />
            </div>
          </div>
          <ButtonLink href="/productos">Ir a la tienda</ButtonLink>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          ¿Ya compraste? <Link href="/rastrear-pedido" className="underline underline-offset-4 hover:text-fg">Rastrea tu pedido</Link>
        </p>
      </section>
    </main>
  );
}
