"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartQuoteLine } from "@/lib/store/contract";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import { useCart } from "./CartProvider";

/** Línea del carrito con cantidad y eliminar. Se usa en la página del carrito y en el carrito lateral (compact). */
export function CartLineItem({ line, compact = false, onNavigate }: { line: CartQuoteLine; compact?: boolean; onNavigate?: () => void }) {
  const { setQuantity, remove } = useCart();
  const money = (value: { amount: number; currency: string }) => formatMoney(value.amount, value.currency);
  const step = compact ? "size-9" : "size-11";
  return (
    <li className={`flex ${compact ? "gap-4 py-4" : "gap-4 py-5 sm:gap-6"}`}>
      <Link href={`/productos/${line.slug}`} onClick={onNavigate} className={`relative shrink-0 overflow-hidden bg-sand ${compact ? "size-20" : "size-24 sm:size-28"}`}>
        <Image src={line.image.src} alt="" fill sizes="112px" className="object-cover transition-transform duration-500 ease-soft hover:scale-105" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/productos/${line.slug}`} onClick={onNavigate} className={`font-serif leading-tight font-medium hover:underline hover:underline-offset-4 ${compact ? "text-xl" : "text-2xl"}`}>{line.name}</Link>
            <p className="mt-0.5 text-sm text-muted lining-nums">{money(line.unitPrice)} c/u</p>
          </div>
          <p key={line.subtotal.amount} className="animate-tick shrink-0 font-semibold lining-nums tabular-nums">{money(line.subtotal)}</p>
        </div>
        {line.notice && <p className="mt-1 text-xs text-warning">{line.notice}</p>}
        {!line.available && <p className="mt-1 text-xs text-danger">Agotado: quítalo para continuar.</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <div role="group" aria-label={`Cantidad de ${line.name}`} className="inline-flex items-stretch divide-x divide-border border border-border bg-[#fffdf9]">
            <button type="button" aria-label="Quitar uno" disabled={line.quantity <= 1} onClick={() => setQuantity(line.productId, line.quantity - 1)} className={`grid ${step} place-items-center transition-colors hover:bg-sand/60 active:bg-sand disabled:text-muted/40`}>
              <MinusIcon className="size-3.5" />
            </button>
            <output aria-live="polite" className="grid w-10 place-items-center font-semibold lining-nums">{line.quantity}</output>
            <button type="button" aria-label="Agregar uno" disabled={line.quantity >= line.maxQuantity} onClick={() => setQuantity(line.productId, line.quantity + 1)} className={`grid ${step} place-items-center transition-colors hover:bg-sand/60 active:bg-sand disabled:text-muted/40`}>
              <PlusIcon className="size-3.5" />
            </button>
          </div>
          <button type="button" onClick={() => remove(line.productId)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-danger">
            <TrashIcon className="size-4" /> {compact ? "Quitar" : "Eliminar"}
          </button>
        </div>
      </div>
    </li>
  );
}
