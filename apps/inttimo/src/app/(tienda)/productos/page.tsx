import type { Metadata } from "next";
import { Reveal } from "@/components/ui/Reveal";
import { ProductCard, TrustStrip } from "@/components/store/Blocks";
import { PageHero, SectionHeading } from "@/components/store/PageHero";
import { getProductContent } from "@/content/products";
import { getStoreApi } from "@/lib/store/api";

export const metadata: Metadata = { title: "Productos" };

/** 03 · Productos / tienda: catálogo escalable (hoy UNO+UNO). Filtros cuando el catálogo crezca. */
export default async function ProductosPage() {
  const result = await getStoreApi().catalog();
  const products = result.ok ? result.data.products : [];
  const hero = getProductContent("uno-mas-uno")!.hero;

  return (
    <main>
      <PageHero eyebrow="Tienda" title="Herramientas para cultivar su matrimonio." body="Hoy UNO+UNO; pronto, nuevas herramientas físicas y digitales para cada etapa." image={hero} size="sm" />

      <section className="container-page section-y">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading align="left" eyebrow="Catálogo" title="Todos los productos" />
          <p className="text-sm text-muted">{products.length} {products.length === 1 ? "producto" : "productos"}</p>
        </div>

        {!result.ok && (
          <p role="alert" className="mt-10 border border-danger/30 bg-danger/5 px-5 py-4 text-sm text-danger">{result.error.message}</p>
        )}

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <Reveal as="li" key={product.id} delay={index * 80}>
              <ProductCard product={product} priority={index === 0} />
            </Reveal>
          ))}
          <li className="flex min-h-80 flex-col items-center justify-center border border-dashed border-border px-6 text-center">
            <p className="font-serif text-2xl">Próximamente</p>
            <p className="mt-2 max-w-xs text-sm text-muted">Nuevas herramientas para cada etapa de su matrimonio. Suscríbete abajo para enterarte primero.</p>
          </li>
        </ul>
      </section>

      <section className="border-t border-border/70 bg-surface">
        <div className="container-page py-12"><TrustStrip /></div>
      </section>
    </main>
  );
}
