import type { Metadata } from "next";
import { AnchorButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { CheckIcon } from "@/components/ui/icons";
import { ChurchQuoteForm } from "@/components/store/forms/ChurchQuoteForm";
import { PageHero, SectionHeading } from "@/components/store/PageHero";
import { churches } from "@/content/store";
import { getProductContent } from "@/content/products";

export const metadata: Metadata = { title: "Para iglesias y ministerios" };

/** 05 · Iglesias y ministerios: usos, por qué UNO+UNO y solicitud de cotización (sin precios B2B publicados). */
export default function IglesiasPage() {
  const content = getProductContent("uno-mas-uno")!;
  return (
    <main>
      <PageHero
        tone="dark"
        eyebrow="Para iglesias y ministerios"
        title={<>Matrimonios más fuertes, <em className="font-normal">comunidades más sólidas</em>.</>}
        body="Herramientas prácticas para acompañar, formar y fortalecer matrimonios en tu iglesia, ministerio o retiro."
        image={content.hero}
        actions={<AnchorButton href="#cotizacion" variant="inverse" arrow="down">Solicitar cotización</AnchorButton>}
      />

      <section className="container-page section-y">
        <Reveal><SectionHeading eyebrow="Para cada contexto" title="Una herramienta simple, con un gran impacto." /></Reveal>
        <ul className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {churches.uses.map((use, index) => (
            <Reveal as="li" key={use.title} delay={index * 60} className="bg-bg px-6 py-7">
              <p className="font-serif text-2xl font-medium">{use.title}</p>
              <p className="mt-1.5 text-sm text-muted">{use.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="border-y border-border/70 bg-surface">
        <div className="container-page grid gap-10 section-y lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Reveal>
            <SectionHeading align="left" eyebrow="Opciones para tu ministerio" title="Paquetes que se adaptan a tu visión." body="Preparamos una propuesta según el tamaño de tu comunidad y el uso que le darán. Cuéntanos tu proyecto y te respondemos en hasta 24 horas hábiles." />
            <ul className="mt-8 space-y-3 text-sm">
              {["Atención personalizada para tu iglesia o ministerio", "Propuesta según cantidad y tipo de evento", "Entrega a todo México o recolección en Chihuahua"].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-on-ink"><CheckIcon className="size-3" /></span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <div id="cotizacion" className="scroll-mt-24 border border-border bg-[#fffdf9] p-6 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-8">
            <h2 className="font-serif text-3xl font-medium">Solicitar cotización</h2>
            <p className="mt-1 mb-7 text-sm text-muted">Todos los campos son obligatorios salvo los marcados como opcionales.</p>
            <ChurchQuoteForm />
          </div>
        </div>
      </section>
    </main>
  );
}
