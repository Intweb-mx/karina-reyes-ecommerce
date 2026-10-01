import Link from "next/link";
import type { LegalDocument } from "@/content/legal";

/** Página de un documento legal: texto continuo y legible, sin adornos, con índice de secciones para móvil y escritorio. */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  const headingId = (index: number) => `seccion-${index + 1}`;

  return (
    <main className="container-page section-y">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="inline-block text-sm text-muted underline underline-offset-4 transition-colors hover:text-fg print:hidden">
          ← Volver a inttimo
        </Link>

        <header className="mt-8 border-b border-border pb-8">
          <h1 className="font-serif text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.02] font-medium tracking-[-0.015em] text-balance">
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
          <dl className="mt-8 space-y-1.5 text-sm leading-relaxed">
            {doc.facts.map((fact) => (
              <div key={fact.label} className="sm:flex sm:gap-2">
                <dt className="font-semibold">{fact.label}:</dt>
                <dd className="text-fg/85">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-8 space-y-4 leading-relaxed text-fg/85">
          {doc.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <nav aria-label="Contenido del documento" className="mt-10 border border-border bg-surface px-5 py-5 print:hidden">
          <p className="eyebrow text-muted">Contenido</p>
          <ol className="mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {doc.sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#${headingId(index)}`} className="block py-1 text-fg/80 underline-offset-4 transition-colors hover:text-fg hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {doc.sections.map((section, index) => (
            <section key={section.title} aria-labelledby={headingId(index)} className="scroll-mt-24">
              <h2 id={headingId(index)} className="font-serif text-2xl leading-snug font-medium">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 leading-relaxed text-fg/85">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {doc.appendix && (
          <section aria-labelledby="anexo" className="mt-14 border-t border-border pt-10">
            <h2 id="anexo" className="font-serif text-2xl leading-snug font-medium">
              {doc.appendix.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed text-fg/85">
              {doc.appendix.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
