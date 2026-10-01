import Image from "next/image";
import type { ProductContent } from "@/content/products";
import { GiftIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "./PresaleHero";

/**
 * Bonus exclusivo de preventa: es el incentivo en lugar de un descuento, así que lleva peso visual (brief §5).
 * Foto completa arriba con difuminado hacia el tono arena de la tarjeta y sello "Solo en preventa" sobre la imagen.
 */
export function PresaleBonus({ bonus }: { bonus: NonNullable<ProductContent["bonus"]> }) {
  return (
    <section aria-labelledby="bonus" className="group/card flex h-full flex-col overflow-hidden bg-[#d9c7b3] shadow-[0_30px_60px_-45px_rgb(34_28_23/0.55)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <Image
          src={bonus.image.src}
          alt={bonus.image.alt}
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover transition-transform duration-[1600ms] ease-soft group-hover/card:scale-[1.035]"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent via-[#d9c7b3]/70 to-[#d9c7b3]" />
        <p className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/40 bg-ink/70 px-3.5 py-1.5 text-[0.6875rem] font-semibold tracking-[0.16em] text-on-ink uppercase backdrop-blur-md">
          <GiftIcon className="size-3.5" />
          {bonus.eyebrow}
        </p>
        {bonus.image.placeholder && <PlaceholderTag />}
      </div>

      <div className="relative -mt-16 flex flex-1 flex-col px-6 pb-8 sm:-mt-20 sm:px-9 sm:pb-10">
        <p className="eyebrow text-ink/70">Bonus digital</p>
        <h2 id="bonus" className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,3rem)] leading-[1.03] font-medium text-balance text-ink">
          {bonus.title}
        </h2>
        <p className="mt-4 max-w-md leading-relaxed text-ink/85">{bonus.body}</p>
        <p className="mt-auto pt-6 text-sm leading-relaxed text-ink/70">{bonus.note}</p>
      </div>
    </section>
  );
}
