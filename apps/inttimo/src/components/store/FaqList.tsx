import type { Faq } from "@/lib/store/contract";
import { ChevronDownIcon } from "@/components/ui/icons";

/** Acordeón accesible con <details>: sin JS, funciona con teclado y lector de pantalla. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {faqs.map((faq) => (
        <li key={faq.id} id={`faq-${faq.id}`} className="scroll-mt-24">
          <details className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium transition-colors hover:text-fg/80 [&::-webkit-details-marker]:hidden">
              {faq.question}
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted transition-[transform,background-color,color] duration-(--duration-base) group-open:rotate-180 group-open:border-ink group-open:bg-ink group-open:text-on-ink">
                <ChevronDownIcon className="size-4" />
              </span>
            </summary>
            <p className="pr-12 pb-5 leading-relaxed text-muted">{faq.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
