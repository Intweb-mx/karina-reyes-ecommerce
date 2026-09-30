import Image from "next/image";
import type { ProductContent } from "@/content/products";
import { CheckIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "./PresaleHero";

/** "Qué incluye": deja claro qué se está comprando antes del formulario (brief §4). */
export function ProductIncludes({ includes }: { includes: NonNullable<ProductContent["includes"]> }) {
  return (
    <section aria-labelledby="que-incluye" className="@container overflow-hidden border border-border bg-surface">
      <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] @3xl:grid-rows-1">
      <div className="p-7 sm:p-9">
        <p className="eyebrow text-muted">{includes.eyebrow}</p>
        <h2 id="que-incluye" className="mt-4 font-serif text-[clamp(2.5rem,5vw,3.25rem)] leading-none font-medium lining-nums">
          {includes.title}
        </h2>
        <p className="mt-3 font-serif text-xl leading-snug text-fg/80">{includes.subtitle}</p>
        <ul className="mt-7 space-y-2.5">
          {includes.items.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm lining-nums">
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-fg/25 text-fg/70">
                <CheckIcon className="size-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative aspect-[16/10] bg-sand @3xl:aspect-auto @3xl:min-h-80">
        <Image src={includes.image.src} alt={includes.image.alt} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        {includes.image.placeholder && <PlaceholderTag />}
      </div>
      </div>
    </section>
  );
}
