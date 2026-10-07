import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/store/contract";
import { BookIcon, ChatIcon, GemIcon, HeartIcon, LeafIcon, LockIcon, MapPinIcon, PeopleIcon, SunIcon, TruckIcon } from "@/components/ui/icons";
import { PlaceholderTag } from "@/components/presale/sections/PresaleHero";
import { territories, trustPoints } from "@/content/store";
import { formatMoney } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";
import { AddToCartButton } from "./cart/AddToCartButton";

const TERRITORY_ICONS = { conversacion: ChatIcon, conexion: HeartIcon, intimidad: PeopleIcon, disfrute: SunIcon, conocimiento: BookIcon, fe: LeafIcon };
const TRUST_ICONS = { truck: TruckIcon, pin: MapPinIcon, lock: LockIcon, chat: ChatIcon };

/** "¿Qué quieren cultivar juntos?" — territorios del brief (mockups 01 y 02). */
export function TerritoryGrid({ linkTo }: { linkTo?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {territories.map((territory, index) => {
        const Icon = TERRITORY_ICONS[territory.id];
        const inner = (
          <>
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-sand/80 text-fg/75 transition-colors group-hover:bg-ink group-hover:text-on-ink">
              <Icon className="size-5" />
            </span>
            <span className="mt-4 text-[0.6875rem] font-semibold tracking-[0.16em] uppercase">{territory.title}</span>
            <span className="mt-1 text-sm text-muted">{territory.body}</span>
          </>
        );
        return (
          <Reveal as="li" key={territory.id} delay={index * 60} className="bg-bg">
            {linkTo ? (
              <Link href={`${linkTo}#${territory.id}`} className="group flex h-full flex-col items-center px-4 py-7 text-center transition-colors hover:bg-surface">
                {inner}
              </Link>
            ) : (
              <div className="group flex h-full flex-col items-center px-4 py-7 text-center">{inner}</div>
            )}
          </Reveal>
        );
      })}
    </ul>
  );
}

/** Franja de confianza comercial. Solo afirmaciones respaldadas por las políticas aprobadas. */
export function TrustStrip() {
  return (
    <ul className="grid grid-cols-2 gap-6 lg:grid-cols-4">
      {trustPoints.map((point) => {
        const Icon = TRUST_ICONS[point.key];
        return (
          <li key={point.key} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-6 shrink-0 text-fg/70" />
            <div>
              <p className="text-sm font-semibold">{point.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{point.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_LABEL: Record<ProductSummary["status"], string | null> = {
  available: null,
  low_stock: "Últimas piezas",
  sold_out: "Agotado",
  presale: "Preventa",
  coming_soon: "Próximamente",
};

export function ProductCard({ product, priority }: { product: ProductSummary; priority?: boolean }) {
  const status = STATUS_LABEL[product.status];
  return (
    <article className="group flex h-full flex-col border border-border bg-[#fffdf9] transition-shadow duration-(--duration-base) hover:shadow-[0_24px_48px_-32px_rgb(34_28_23/0.5)]">
      <Link href={`/productos/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-sand">
        <Image src={product.image.src} alt={product.image.alt} fill priority={priority} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-[1200ms] ease-soft group-hover:scale-[1.04]" />
        {status && <span className="absolute top-3 left-3 rounded-full bg-ink/80 px-3 py-1 text-xs font-medium text-on-ink backdrop-blur">{status}</span>}
        {product.image.placeholder && <PlaceholderTag className="right-3 bottom-3" />}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-2xl leading-tight font-medium">
          <Link href={`/productos/${product.slug}`} className="hover:underline hover:underline-offset-4">{product.name}</Link>
        </h3>
        <p className="mt-1 text-sm text-muted">{product.tagline}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="font-serif text-2xl font-medium lining-nums">
            {product.price ? formatMoney(product.price.amount, product.price.currency) : <span className="text-base text-muted">Precio por confirmar</span>}
          </p>
          {product.status !== "sold_out" && product.status !== "coming_soon" && product.price && <AddToCartButton productId={product.id} productName={product.name} compact />}
        </div>
      </div>
    </article>
  );
}

export function GemDivider() {
  return (
    <span aria-hidden="true" className="mx-auto flex w-fit items-center gap-3 text-bronze/70">
      <span className="h-px w-10 bg-current" />
      <GemIcon className="size-4" />
      <span className="h-px w-10 bg-current" />
    </span>
  );
}
