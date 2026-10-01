import Link from "next/link";
import type { LegalDocument } from "@/content/legal";
import { PrintIcon } from "@/components/ui/icons";
import { BackToTop, LegalTocDesktop, LegalTocMobile } from "./LegalToc";
import { PrintButton } from "./PrintButton";

/**
 * Página de un documento legal: texto continuo y legible (medida de ~70 caracteres), sin adornos.
 * Escritorio: índice lateral fijo con la sección actual resaltada. Móvil: índice plegable + botón "volver arriba".
 * Impresión: solo el documento, sin navegación, con cortes de página cuidados.
 */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  const headingId = (index: number) => `seccion-${index + 1}`;
  const items = doc.sections.map((section, index) => ({ id: headingId(index), title: section.title }));

  return (
    <main id="documento" className="container-page section-y scroll-mt-24 print:py-0">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-16">
        <aside className="hidden lg:block print:hidden">
          <LegalTocDesktop items={items} />
        </aside>

        <article className="min-w-0 max-w-3xl print:max-w-none">
          <div className="flex items-center justify-between gap-4 print:hidden">
            <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 transition-colors hover:text-fg">
              ← Volver a inttimo
            </Link>
            <PrintButton>
              <PrintIcon className="size-4" />
              Imprimir
            </PrintButton>
          </div>

          <header className="mt-6 border-b border-border pb-8 print:mt-0">
            <h1 className="font-serif text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.02] font-medium tracking-[-0.015em] text-balance print:text-[24pt]">
              {doc.title.map((line, index) => (
                <span key={line} className="block">
                  {index > 0 && <span className="sr-only"> </span>}
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-5 text-sm text-muted italic">{doc.updated}</p>
          </header>

          {doc.facts && (
            <dl className="mt-8 grid gap-x-6 gap-y-3 border border-border bg-surface px-5 py-5 text-sm leading-relaxed sm:grid-cols-[auto_minmax(0,1fr)] print:border-0 print:bg-transparent print:px-0">
              {doc.facts.map((fact) => (
                <div key={fact.label} className="contents">
                  <dt className="font-semibold">{fact.label}</dt>
                  <dd className="text-fg/85 max-sm:-mt-2 break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-8 space-y-4 text-[1.0625rem] leading-[1.75] text-fg/85 print:text-[11pt] print:leading-normal">
            {doc.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <LegalTocMobile items={items} />

          <div className="mt-12 space-y-12 print:mt-8 print:space-y-6">
            {doc.sections.map((section, index) => (
              <section key={section.title} aria-labelledby={headingId(index)} className="scroll-mt-24">
                <h2 id={headingId(index)} className="font-serif text-[1.625rem] leading-snug font-medium break-after-avoid print:text-[14pt]">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-4 text-[1.0625rem] leading-[1.75] text-fg/85 print:text-[11pt] print:leading-normal">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="break-inside-avoid-page">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {doc.appendix && (
            <section aria-labelledby="anexo" className="mt-16 border-t border-border pt-10 print:break-before-page">
              <h2 id="anexo" className="font-serif text-[1.625rem] leading-snug font-medium print:text-[14pt]">
                {doc.appendix.title}
              </h2>
              <div className="mt-3 space-y-4 text-[1.0625rem] leading-[1.75] text-fg/85 print:text-[11pt] print:leading-normal">
                {doc.appendix.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
      <BackToTop />
    </main>
  );
}
