import Image from "next/image";
import type { ProductContent } from "@/content/products";
import { GiftIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "./PresaleHero";

/** Bonus exclusivo de preventa: es el incentivo en lugar de un descuento, así que lleva peso visual (brief §5). */
export function PresaleBonus({ bonus }: { bonus: NonNullable<ProductContent["bonus"]> }) {
  return (
    <section aria-labelledby="bonus" className="@container overflow-hidden bg-[#d9c7b3]">
      <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] @3xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @3xl:grid-rows-1">
      <div className="p-7 sm:p-9">
        <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.22em] text-ink/70 uppercase">
          <GiftIcon className="size-4" />
          {bonus.eyebrow}
        </p>
        <h2 id="bonus" className="mt-4 font-serif text-[clamp(2rem,4vw,2.625rem)] leading-[1.05] font-medium text-balance text-ink">
          {bonus.title}
        </h2>
        <p className="mt-4 leading-relaxed text-ink/80">{bonus.body}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">{bonus.note}</p>
      </div>
      <div className="relative aspect-[16/10] min-h-56 bg-sand @3xl:aspect-auto @3xl:min-h-72">
        <Image src={bonus.image.src} alt={bonus.image.alt} fill sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
        {bonus.image.placeholder && <PlaceholderTag />}
      </div>
      </div>
    </section>
  );
}
