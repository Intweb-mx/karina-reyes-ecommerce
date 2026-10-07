import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero, SectionHeading } from "@/components/store/PageHero";
import { philosophy } from "@/content/store";
import { getProductContent } from "@/content/products";

export const metadata: Metadata = { title: "Nuestra filosofía" };

/** 06 · Nuestra filosofía: convicciones, misión y visión. Karina aparece como fundadora (texto pendiente de aprobación). */
export default function FilosofiaPage() {
  const content = getProductContent("uno-mas-uno")!;
  return (
    <main>
      <PageHero tone="dark" eyebrow="Nuestra filosofía" title={philosophy.title} body={philosophy.intro} image={content.bonus!.image} />

      <section className="container-page section-y">
        <Reveal><SectionHeading eyebrow="Nuestra convicción" title="El matrimonio importa." /></Reveal>
        <ul className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {philosophy.convictions.map((item, index) => (
            <Reveal as="li" key={item.title} delay={index * 60} className="bg-bg px-6 py-8 text-center">
              <p className="eyebrow">{item.title}</p>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="border-y border-border/70 bg-surface">
        <div className="container-page grid gap-12 section-y md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-muted">Nuestra misión</p>
            <p className="mt-4 font-serif text-[clamp(2rem,4vw,2.75rem)] leading-tight">{philosophy.mission}</p>
          </Reveal>
          <Reveal delay={120}>
            <p className="eyebrow text-muted">Nuestra visión</p>
            <p className="mt-4 font-serif text-[clamp(2rem,4vw,2.75rem)] leading-tight">{philosophy.vision}</p>
          </Reveal>
        </div>
      </section>

      <section className="container-page section-y">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-muted">La historia detrás de inttimo</p>
          <p className="mt-4 font-serif text-3xl">Karina Jáquez, fundadora y creadora.</p>
          {philosophy.founderPending && (
            <p className="mt-4 border border-dashed border-warning/40 bg-warning/5 px-5 py-4 text-sm text-warning">
              Texto de la historia y fotografía de Karina: pendientes de entrega y aprobación.
            </p>
          )}
          <div className="mt-10"><ButtonLink href="/productos">Conoce nuestras herramientas</ButtonLink></div>
        </div>
      </section>
    </main>
  );
}
