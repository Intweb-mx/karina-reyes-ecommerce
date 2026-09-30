"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnchorButton } from "@/components/ui/Button";
import { ClockIcon } from "@/components/ui/icons";

type Props = { productName: string; tagline?: string; thumbnail?: string; price: string; currency: string; closes: string };

/**
 * Barra de compra fija (todas las pantallas): mantiene producto, precio, cierre y CTA a la mano mientras
 * la persona lee el contenido. Se oculta sobre el hero (que ya tiene su CTA) y sobre el formulario.
 */
export function StickyBuyBar({ productName, tagline, thumbnail, price, currency, closes }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("preventa-hero");
    const form = document.getElementById("reserva");
    if (!hero || !form) return;
    const inView = new Map<Element, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
      setVisible(!inView.get(hero) && !inView.get(form));
    });
    observer.observe(hero);
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[#fffdf9]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_40px_-24px_rgb(34_28_23/0.4)] backdrop-blur-md transition-transform duration-(--duration-base) ease-soft print:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="container-page flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          {thumbnail && (
            <div className="relative hidden size-12 shrink-0 overflow-hidden bg-sand sm:block">
              <Image src={thumbnail} alt="" fill sizes="48px" className="object-cover" />
            </div>
          )}
          <div className="hidden min-w-0 md:block">
            <p className="font-serif text-xl leading-tight font-medium">{productName}</p>
            {tagline && <p className="truncate text-xs text-muted">{tagline}</p>}
          </div>
          <div className="md:border-l md:border-border md:pl-5">
            <p className="flex items-baseline gap-1.5">
              <span className="font-serif text-2xl leading-none font-medium lining-nums">{price}</span>
              <span className="text-[0.625rem] font-semibold tracking-[0.14em] text-muted uppercase">{currency}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-muted lining-nums">
              <ClockIcon className="size-3.5" />
              Preventa hasta el {closes}
            </p>
          </div>
        </div>
        <AnchorButton href="#reserva" variant="bronze" size="md" arrow="right" className="shrink-0">
          <span className="sm:hidden">Comprar</span>
          <span className="hidden sm:inline">{`Quiero mi ${productName}`}</span>
        </AnchorButton>
      </div>
    </div>
  );
}
