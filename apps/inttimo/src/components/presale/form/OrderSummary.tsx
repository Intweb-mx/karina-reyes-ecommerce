import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CalendarIcon, CheckIcon, GiftIcon, LockIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import type { ProductContent } from "@/content/products";
import { formCopy } from "@/content/presale";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { FieldError } from "./fields";

type Status = "idle" | "submitting" | "redirecting";

export function submitLabel(status: Status, productName: string) {
  return status === "redirecting" ? formCopy.redirecting : status === "submitting" ? formCopy.submitting : formCopy.submit(productName);
}

type SummaryProps = {
  productName: string;
  product: ProductContent | null;
  unitAmount: number;
  currency: string;
  quantity: number;
  maxQuantity: number;
  onQuantity: (value: number) => void;
  quantityErrors?: string[];
};

/**
 * "Tu compra" en formato tabla: producto, cantidad (editable aquí mismo), precio unitario, total,
 * lanzamiento y condición de preventa. Se muestra junto a los términos y el pago (brief §9).
 */
export function PurchaseSummary({ productName, product, unitAmount, currency, quantity, maxQuantity, onQuantity, quantityErrors }: SummaryProps) {
  const money = (amount: number) => formatMoney(amount, currency);
  const stepButton =
    "grid size-9 place-items-center text-fg transition-colors duration-(--duration-base) hover:bg-sand active:bg-sand/80 disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent";

  return (
    <section aria-labelledby="tu-compra">
      <h3 id="tu-compra" className="eyebrow text-muted">
        Tu compra
      </h3>

      {/* Producto */}
      <div className="mt-5 flex gap-4">
        {product?.thumbnail && (
          <div className="relative size-20 shrink-0 overflow-hidden bg-sand">
            <Image src={product.thumbnail.src} alt="" fill sizes="80px" className="object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-serif text-2xl leading-tight font-medium">{productName}</p>
          {product?.tagline && <p className="mt-0.5 text-sm text-muted">{product.tagline}</p>}
          {product?.bonus && (
            <p className="mt-2 inline-flex items-center gap-1.5 bg-[#d9c7b3]/60 px-2 py-1 text-xs font-medium text-ink">
              <GiftIcon className="size-3.5" />
              Incluye bonus digital de preventa
            </p>
          )}
        </div>
      </div>

      {/* Tabla */}
      <table className="mt-6 w-full border-t border-border text-sm">
        <caption className="sr-only">Detalle del precio</caption>
        <tbody className="divide-y divide-border">
          <Row label="Precio unitario">
            {money(unitAmount)} <Unit>{currency}</Unit>
          </Row>
          <Row label={<span id="cantidad-label">Cantidad</span>}>
            {maxQuantity > 1 ? (
              <span role="group" aria-labelledby="cantidad-label" className="inline-flex items-center border border-border bg-[#fffdf9]">
                <button type="button" className={stepButton} onClick={() => onQuantity(quantity - 1)} disabled={quantity <= 1} aria-label="Quitar uno">
                  <MinusIcon className="size-3.5" />
                </button>
                <output id="quantity" aria-live="polite" className="w-9 text-center font-semibold lining-nums tabular-nums">
                  {quantity}
                </output>
                <button type="button" className={stepButton} onClick={() => onQuantity(quantity + 1)} disabled={quantity >= maxQuantity} aria-label="Agregar uno">
                  <PlusIcon className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="lining-nums">1</span>
            )}
          </Row>
          {maxQuantity > 1 && (
            <tr>
              <td colSpan={2} className="pt-0 pb-3 text-right text-xs text-muted">
                Máximo {maxQuantity} por compra.
              </td>
            </tr>
          )}
          <Row label="Subtotal">
            {money(unitAmount * quantity)} <Unit>{currency}</Unit>
          </Row>
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-fg">
            <th scope="row" className="pt-4 text-left text-base font-semibold">
              Total
            </th>
            <td className="pt-4 text-right">
              <span key={quantity} className="animate-tick inline-block font-serif text-4xl leading-none font-medium lining-nums tabular-nums" aria-live="polite">
                {money(unitAmount * quantity)}
              </span>{" "}
              <Unit>{currency}</Unit>
            </td>
          </tr>
        </tfoot>
      </table>
      <FieldError id="quantity" errors={quantityErrors} />

      <div className="mt-6 space-y-2.5 bg-bg/70 px-4 py-4 text-sm">
        {product?.launchDate && (
          <p className="flex items-start gap-2.5">
            <CalendarIcon className="mt-0.5 size-4 shrink-0 text-fg/60" />
            <span>
              Lanzamiento oficial: <strong className="font-semibold lining-nums">{formatCalendarDate(product.launchDate)}</strong>
            </span>
          </p>
        )}
        <p className="flex items-start gap-2.5 text-muted">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-fg/60" />
          Compra en preventa: pagas hoy el precio completo y tu pedido queda registrado para el lanzamiento.
        </p>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-3 text-left font-normal text-muted">
        {label}
      </th>
      <td className="py-3 text-right lining-nums tabular-nums">{children}</td>
    </tr>
  );
}

function Unit({ children }: { children: ReactNode }) {
  return <span className="text-[0.625rem] font-semibold tracking-[0.14em] text-muted uppercase">{children}</span>;
}

/** Botón de pago + nota de seguridad. */
export function PayBlock({ productName, status }: { productName: string; status: Status }) {
  const busy = status !== "idle";
  return (
    <div id="pagar" className="space-y-3">
      <Button type="submit" variant="bronze" block arrow="right" loading={busy} disabled={busy}>
        {submitLabel(status, productName)}
      </Button>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
        <LockIcon className="size-3.5 shrink-0" />
        {formCopy.secureNote}
      </p>
    </div>
  );
}
