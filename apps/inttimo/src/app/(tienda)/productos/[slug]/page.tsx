import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { CheckIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "@/components/presale/sections/PresaleHero";
import { TrustStrip } from "@/components/store/Blocks";
import { AddToCartButton } from "@/components/store/cart/AddToCartButton";
import { StickyBuyBar } from "@/components/store/cart/StickyBuyBar";
import { FaqList } from "@/components/store/FaqList";
import { SectionHeading } from "@/components/store/PageHero";
import { legalPaths } from "@/content/legal";
import { getStoreApi } from "@/lib/store/api";
import { formatMoney } from "@/lib/format";

async function load(slug: string) {
  const result = await getStoreApi().product(slug);
  if (!result.ok) notFound();
  return result.data;
}

export async function generateMetadata({ params }: PageProps<"/productos/[slug]">): Promise<Metadata> {
  const product = await load((await params).slug);
  return { title: product.seo.title, description: product.seo.description };
}

/** 04 · Detalle de producto: qué es, galería, qué incluye, cómo se juega, FAQs y compra. */
export default async function ProductPage({ params }: PageProps<"/productos/[slug]">) {
  const product = await load((await params).slug);
  const [main, ...rest] = product.gallery;
  const purchasable = !!product.price && product.status !== "sold_out" && product.status !== "coming_soon";

  return (
    <main>
      <nav aria-label="Ruta" className="container-page pt-6 text-sm text-muted">
        <Link href="/productos" className="hover:text-fg">Productos</Link> <span aria-hidden="true">/</span> <span className="text-fg">{product.name}</span>
      </nav>

      <section className="container-page grid gap-10 pt-6 pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pb-24">
        {/* Galería */}
        <div className="space-y-3">
          {main && (
            <div className="relative aspect-[4/5] overflow-hidden bg-sand sm:aspect-[5/4] lg:aspect-[4/5]">
              <Image src={main.src} alt={main.alt} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              {main.placeholder && <PlaceholderTag />}
            </div>
          )}
          {rest.length > 0 && (
            <ul className="grid grid-cols-3 gap-3">
              {rest.map((image) => (
                <li key={image.src} className="relative aspect-[4/3] overflow-hidden bg-sand">
                  <Image src={image.src} alt={image.alt} fill sizes="20vw" className="object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Compra */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow text-muted">Un juego para matrimonios</p>
          <h1 className="mt-4 font-serif text-[clamp(3rem,6vw,4.75rem)] leading-none font-medium">{product.name}</h1>
          <p className="mt-3 font-serif text-2xl text-fg/85 italic">{product.tagline}</p>
          <div className="mt-6 space-y-3 leading-relaxed text-muted">
            {product.description.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <p className="flex items-baseline gap-3">
              {product.price ? (
                <span className="font-serif text-4xl font-medium lining-nums">{formatMoney(product.price.amount, product.price.currency)}</span>
              ) : (
                <span className="text-muted">Precio por confirmar</span>
              )}
              {product.compareAtPrice && <s className="text-muted lining-nums">{formatMoney(product.compareAtPrice.amount, product.compareAtPrice.currency)}</s>}
              {product.price && <span className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{product.price.currency}</span>}
            </p>
            <p className="mt-1 text-xs text-muted">El envío se calcula en el checkout. <Link href={legalPaths.shipping} className="underline underline-offset-4">Envíos y recolección</Link></p>
            <div id="comprar" className="mt-6">
              {purchasable ? (
                <AddToCartButton productId={product.id} productName={product.name} withQuantity max={product.maxQuantityPerOrder} />
              ) : (
                <p className="border border-border bg-surface px-4 py-3 text-sm">{product.status === "sold_out" ? "Agotado por ahora." : "Disponible muy pronto."}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-surface">
        <div className="container-page grid gap-12 section-y lg:grid-cols-2">
          <Reveal>
            <SectionHeading align="left" eyebrow="Qué incluye" title="Todo lo que necesitan para empezar." />
            <ul className="mt-8 space-y-3">
              {product.includes.map((item) => (
                <li key={item} className="flex items-center gap-3 lining-nums">
                  <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-ink text-on-ink"><CheckIcon className="size-3.5" /></span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <SectionHeading align="left" eyebrow="Cómo se juega" title="Pequeñas preguntas, grandes conversaciones." />
            <ol className="mt-8 grid gap-5 sm:grid-cols-2">
              {product.howToPlay.map((step, index) => (
                <li key={step.title} className="border-l border-border pl-4">
                  <span aria-hidden="true" className="font-serif text-3xl text-fg/55 lining-nums">{String(index + 1).padStart(2, "0")}</span>
                  <p className="mt-1 font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {product.faqs.length > 0 && (
        <section className="container-page section-y">
          <SectionHeading eyebrow="Preguntas frecuentes" title={`Sobre ${product.name}`} />
          <div className="mx-auto mt-10 max-w-3xl"><FaqList faqs={product.faqs} /></div>
          <p className="mt-6 text-center text-sm text-muted"><Link href="/ayuda" className="underline underline-offset-4 hover:text-fg">Ver todas las preguntas</Link></p>
        </section>
      )}

      <section className="border-t border-border/70">
        <div className="container-page py-12"><TrustStrip /></div>
      </section>
      {purchasable && product.price && <StickyBuyBar productId={product.id} productName={product.name} price={formatMoney(product.price.amount, product.price.currency)} targetId="comprar" />}
    </main>
  );
}
