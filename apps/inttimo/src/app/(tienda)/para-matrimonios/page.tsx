import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { ProductCard, TerritoryGrid, TrustStrip } from "@/components/store/Blocks";
import { PageHero, SectionHeading } from "@/components/store/PageHero";
import { territories } from "@/content/store";
import { getProductContent } from "@/content/products";
import { getStoreApi } from "@/lib/store/api";

export const metadata: Metadata = { title: "Para matrimonios" };

/** 02 · Para matrimonios: entrada por territorio (lo que la pareja quiere cultivar). */
export default async function ParaMatrimoniosPage() {
  const result = await getStoreApi().catalog();
  const products = result.ok ? result.data.products : [];
  const hero = getProductContent("uno-mas-uno")!.bonus!.image;

  return (
    <main>
      <PageHero
        tone="dark"
        eyebrow="Para matrimonios"
        title={<>Herramientas para una vida <em className="font-normal">más conectada</em>.</>}
        body="Cada matrimonio es único. Aquí encontrarán herramientas que los acompañan en cada etapa para cultivar lo que más importa: lo que pasa entre ustedes."
        image={hero}
      />

      <section className="container-page section-y">
        <Reveal><SectionHeading eyebrow="Explora por temas" title="¿Qué quieren cultivar juntos?" /></Reveal>
        <div className="mt-12"><TerritoryGrid /></div>
      </section>

      <section className="border-y border-border/70 bg-surface">
        <div className="container-page section-y space-y-16">
          {territories.map((territory) => {
            const matches = products.filter((product) => product.territories.includes(territory.id));
            return (
              <Reveal key={territory.id}>
                <section id={territory.id} aria-labelledby={`t-${territory.id}`} className="scroll-mt-24 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
                  <div>
                    <p className="eyebrow text-muted">Territorio</p>
                    <h2 id={`t-${territory.id}`} className="mt-3 font-serif text-4xl font-medium">{territory.title}</h2>
                    <p className="mt-2 text-muted">{territory.body}</p>
                  </div>
                  {matches.length ? (
                    <ul className="grid gap-5 sm:grid-cols-2">
                      {matches.map((product) => (
                        <li key={product.id}><ProductCard product={product} /></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border border-dashed border-border px-5 py-8 text-center text-sm text-muted">Nuevas herramientas para este tema llegarán pronto.</p>
                  )}
                </section>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="container-page section-y">
        <TrustStrip />
        <div className="mt-10 text-center"><ButtonLink href="/productos">Ver todos los productos</ButtonLink></div>
      </section>
    </main>
  );
}
