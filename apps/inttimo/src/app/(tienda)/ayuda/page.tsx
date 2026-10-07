import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { FaqSearch } from "@/components/store/FaqSearch";
import { PageHero } from "@/components/store/PageHero";
import { SupportChannels } from "@/components/store/SupportChannels";
import { legalDocuments } from "@/content/legal";
import { faqs } from "@/content/store";

export const metadata: Metadata = { title: "Ayuda y preguntas frecuentes" };

/** 11 · Ayuda / FAQ: buscador, categorías, políticas y escalamiento a soporte. */
export default function AyudaPage() {
  return (
    <main>
      <PageHero eyebrow="Ayuda y soporte" title={<>Estamos aquí para <em className="font-normal">ayudarte</em>.</>} body="Encuentra respuestas a las preguntas más comunes sobre compras, envíos, recolección y cambios." size="sm" />
      <div className="container-page grid gap-12 section-y lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-label="Preguntas frecuentes"><FaqSearch faqs={faqs} /></section>
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-border bg-surface p-6">
            <p className="font-serif text-2xl font-medium">¿No encuentras lo que buscas?</p>
            <p className="mt-1 text-sm text-muted">Escríbenos y con gusto te ayudamos.</p>
            <div className="mt-5"><SupportChannels /></div>
            <ButtonLink href="/contacto" size="md" className="mt-5 w-full">Ir a contacto</ButtonLink>
          </div>
          <nav aria-label="Políticas" className="text-sm">
            <p className="eyebrow text-muted">Políticas</p>
            <ul className="mt-3 space-y-2">
              {legalDocuments.map((doc) => <li key={doc.slug}><Link href={`/${doc.slug}`} className="underline underline-offset-4 hover:text-fg">{doc.shortTitle}</Link></li>)}
            </ul>
          </nav>
        </aside>
      </div>
    </main>
  );
}
