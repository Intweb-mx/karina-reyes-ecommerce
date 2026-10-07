"use client";

import { useMemo, useState } from "react";
import type { Faq } from "@/lib/store/contract";
import { SearchIcon } from "@/components/ui/icons";
import { faqCategories } from "@/content/store";
import { FaqList } from "./FaqList";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Centro de ayuda: búsqueda instantánea (sin acentos) y filtro por categoría. */
export function FaqSearch({ faqs }: { faqs: Faq[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Faq["category"] | "all">("all");
  const results = useMemo(() => {
    const q = normalize(query.trim());
    return faqs.filter((faq) => (category === "all" || faq.category === category) && (!q || normalize(`${faq.question} ${faq.answer}`).includes(q)));
  }, [faqs, query, category]);
  const categories = Object.entries(faqCategories) as [Faq["category"], string][];

  return (
    <div>
      <div role="search" className="relative">
        <label htmlFor="faq-buscar" className="sr-only">Buscar una pregunta</label>
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          id="faq-buscar"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar una pregunta… (ej. envío, factura, recoger)"
          className="block min-h-14 w-full border border-border bg-[#fffdf9] pr-4 pl-12 text-base outline-none focus:border-fg focus:shadow-[0_0_0_4px_var(--color-sand)]"
        />
      </div>
      <div role="group" aria-label="Categorías" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {[["all", "Todas"] as const, ...categories].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition-colors ${category === value ? "border-ink bg-ink text-on-ink" : "border-border bg-[#fffdf9] hover:border-fg/40"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-6 text-sm text-muted">{results.length} {results.length === 1 ? "pregunta" : "preguntas"}</p>
      <div className="mt-3">
        {results.length ? <FaqList faqs={results} /> : <p className="border border-dashed border-border px-5 py-8 text-center text-sm text-muted">No encontramos preguntas con «{query}». Escríbenos y te ayudamos.</p>}
      </div>
    </div>
  );
}
