import Image from "next/image";
import type { ProductContent } from "@/content/products";
import { CheckIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "./PresaleHero";

/**
 * "Qué incluye": la foto va completa arriba (las imágenes son 4:3, sin recortes) y se funde con la tarjeta
 * mediante un difuminado; debajo, el contenido de la caja. Deja claro qué se compra antes del formulario (brief §4).
 */
export function ProductIncludes({ includes }: { includes: NonNullable<ProductContent["includes"]> }) {
  return (
    <section aria-labelledby="que-incluye" className="group/card flex h-full flex-col overflow-hidden border border-border bg-surface shadow-[0_30px_60px_-45px_rgb(34_28_23/0.45)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <Image
          src={includes.image.src}
          alt={includes.image.alt}
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover transition-transform duration-[1600ms] ease-soft group-hover/card:scale-[1.035]"
        />
        {/* Difuminado hacia el color de la tarjeta: la foto "entra" al contenido sin corte duro. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent via-surface/70 to-surface" />
        {includes.image.placeholder && <PlaceholderTag />}
      </div>

      <div className="relative -mt-16 flex flex-1 flex-col px-6 pb-8 sm:-mt-20 sm:px-9 sm:pb-10">
        <p className="eyebrow text-muted">{includes.eyebrow}</p>
        <h2 id="que-incluye" className="mt-3 font-serif text-[clamp(2.75rem,5vw,3.5rem)] leading-none font-medium lining-nums">
          {includes.title}
        </h2>
        <p className="mt-3 max-w-md font-serif text-xl leading-snug text-fg/80">{includes.subtitle}</p>
        <ul className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {includes.items.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm lining-nums">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-on-ink">
                <CheckIcon className="size-3.5" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
