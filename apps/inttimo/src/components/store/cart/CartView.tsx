"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { BagIcon, LockIcon, MinusIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@/lib/format";
import { useCart } from "./CartProvider";
import { useCartQuote } from "./useCartQuote";

/** 07 · Carrito: cantidades, eliminar, cupón, resumen calculado en servidor y paso seguro a checkout. */
export function CartView() {
  const { setQuantity, remove, count } = useCart();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | undefined>();
  const { quote, error, loading } = useCartQuote(coupon);
  const money = (value: { amount: number; currency: string }) => formatMoney(value.amount, value.currency);

  if (!loading && !count) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-sand text-fg/70"><BagIcon className="size-7" /></span>
        <h2 className="mt-6 font-serif text-4xl font-medium">Tu carrito está vacío.</h2>
        <p className="mt-3 text-muted">Explora nuestras herramientas para seguir cultivando su matrimonio.</p>
        <ButtonLink href="/productos" className="mt-8">Ir a la tienda</ButtonLink>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
      <section aria-labelledby="productos-carrito">
        <h2 id="productos-carrito" className="sr-only">Productos en tu carrito</h2>
        {error && <p role="alert" className="mb-4 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}
        <ul className="divide-y divide-border border-y border-border">
          {loading && !quote ? (
            <li className="flex items-center gap-3 py-10 text-sm text-muted"><Spinner className="size-5" /> Calculando tu carrito…</li>
          ) : (
            quote?.lines.map((line) => (
              <li key={line.productId} className="flex gap-4 py-5 sm:gap-6">
                <Link href={`/productos/${line.slug}`} className="relative size-24 shrink-0 overflow-hidden bg-sand sm:size-28">
                  <Image src={line.image.src} alt="" fill sizes="112px" className="object-cover" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/productos/${line.slug}`} className="font-serif text-2xl leading-tight font-medium hover:underline hover:underline-offset-4">{line.name}</Link>
                      <p className="mt-0.5 text-sm text-muted lining-nums">{money(line.unitPrice)} c/u</p>
                    </div>
                    <p className="shrink-0 font-semibold lining-nums tabular-nums">{money(line.subtotal)}</p>
                  </div>
                  {line.notice && <p className="mt-1 text-xs text-warning">{line.notice}</p>}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                    <div role="group" aria-label={`Cantidad de ${line.name}`} className="inline-flex items-stretch divide-x divide-border border border-border bg-[#fffdf9]">
                      <button type="button" aria-label="Quitar uno" onClick={() => setQuantity(line.productId, line.quantity - 1)} className="grid size-11 place-items-center hover:bg-sand/60"><MinusIcon className="size-3.5" /></button>
                      <output aria-live="polite" className="grid w-10 place-items-center font-semibold lining-nums">{line.quantity}</output>
                      <button type="button" aria-label="Agregar uno" disabled={line.quantity >= line.maxQuantity} onClick={() => setQuantity(line.productId, line.quantity + 1)} className="grid size-11 place-items-center hover:bg-sand/60 disabled:text-muted/40"><PlusIcon className="size-3.5" /></button>
                    </div>
                    <button type="button" onClick={() => remove(line.productId)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-danger">
                      <TrashIcon className="size-4" /> Eliminar
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        <Link href="/productos" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">← Seguir comprando</Link>
      </section>

      <aside aria-labelledby="resumen" className="lg:sticky lg:top-24 lg:self-start">
        <div className="border border-border bg-[#fffdf9] p-6 shadow-[0_24px_48px_-32px_rgb(34_28_23/0.35)]">
          <h2 id="resumen" className="eyebrow text-muted">Resumen del pedido</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Subtotal</dt><dd className="lining-nums tabular-nums">{quote ? money(quote.subtotal) : "—"}</dd></div>
            {quote?.discount && <div className="flex justify-between gap-4 text-success"><dt>Descuento {quote.coupon?.label}</dt><dd className="lining-nums">−{money(quote.discount)}</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-muted">Envío</dt><dd className="text-muted">Se calcula en el checkout</dd></div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
              <dt className="font-semibold">Total</dt>
              <dd className="font-serif text-3xl font-medium lining-nums tabular-nums" aria-live="polite">{loading ? <Spinner className="size-5" /> : quote ? money(quote.total) : "—"}</dd>
            </div>
          </dl>

          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              setCoupon(couponInput.trim() || undefined);
            }}
          >
            <label htmlFor="cupon" className="text-sm font-medium">¿Tienes un cupón?</label>
            <div className="mt-2 flex gap-2">
              <input id="cupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} aria-describedby={quote?.couponError ? "cupon-error" : undefined} className="min-h-11 min-w-0 flex-1 border border-border bg-bg px-3 text-sm uppercase outline-none focus:border-fg" />
              <button type="submit" className="min-h-11 border border-fg/80 px-4 text-xs font-semibold tracking-[0.12em] uppercase hover:bg-fg hover:text-bg">Aplicar</button>
            </div>
            {quote?.couponError && <p id="cupon-error" className="mt-1.5 text-xs text-danger">{quote.couponError}</p>}
          </form>

          <ButtonLink href="/checkout" variant="bronze" block className="mt-6" aria-disabled={!quote || loading}>
            Finalizar compra
          </ButtonLink>
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted"><LockIcon className="size-3.5" /> Pago seguro procesado por Stripe.</p>
        </div>
      </aside>
    </div>
  );
}
