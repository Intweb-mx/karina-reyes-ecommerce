"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BagIcon, CheckIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { useCart } from "./CartProvider";

/** Agrega al carrito con confirmación visible y anunciada; opcionalmente con selector de cantidad. */
export function AddToCartButton({ productId, productName, compact, withQuantity, max = 10 }: { productId: string; productName: string; compact?: boolean; withQuantity?: boolean; max?: number }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2400);
    return () => clearTimeout(timer);
  }, [added]);

  function onAdd() {
    add(productId, quantity);
    setAdded(true);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Agregar ${productName} al carrito`}
        className={`inline-flex min-h-11 items-center gap-2 border px-4 text-xs font-semibold tracking-[0.14em] uppercase transition-colors ${added ? "border-success bg-success text-on-ink" : "border-fg/80 hover:bg-fg hover:text-bg"}`}
      >
        {added ? <CheckIcon className="animate-pop size-4" /> : <BagIcon className="size-4" />}
        <span aria-live="polite">{added ? "Agregado" : "Agregar"}</span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-3">
        {withQuantity && (
          <div role="group" aria-label="Cantidad" className="inline-flex items-stretch divide-x divide-border border border-border bg-[#fffdf9]">
            <button type="button" aria-label="Quitar uno" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)} className="grid size-14 place-items-center hover:bg-sand/60 disabled:text-muted/40">
              <MinusIcon className="size-4" />
            </button>
            <output aria-live="polite" className="grid w-12 place-items-center font-serif text-xl lining-nums">{quantity}</output>
            <button type="button" aria-label="Agregar uno" disabled={quantity >= max} onClick={() => setQuantity((q) => q + 1)} className="grid size-14 place-items-center hover:bg-sand/60 disabled:text-muted/40">
              <PlusIcon className="size-4" />
            </button>
          </div>
        )}
        <Button type="button" variant="bronze" arrow={added ? false : "right"} onClick={onAdd} className="flex-1 sm:flex-none sm:min-w-72" icon={added ? <CheckIcon className="animate-pop size-4" /> : undefined}>
          <span aria-live="polite">{added ? "Agregado al carrito" : "Agregar al carrito"}</span>
        </Button>
      </div>
      {added && (
        <p role="status" className="animate-rise text-sm [animation-duration:300ms]">
          Listo.{" "}
          <Link href="/carrito" className="font-semibold underline underline-offset-4">Ver carrito</Link> o sigue explorando.
        </p>
      )}
    </div>
  );
}
