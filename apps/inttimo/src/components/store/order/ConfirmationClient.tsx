"use client";

import { useEffect, useState } from "react";
import type { OrderView } from "@/lib/store/contract";
import { ButtonLink } from "@/components/ui/Button";
import { AlertIcon, CheckIcon, MailIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreApi } from "@/lib/store/api";
import { formatDate } from "@/lib/format";
import { DeliveryInfo, OrderLines, OrderSteps, PAYMENT_TEXT } from "./OrderParts";

/** 09 · Confirmación: folio real, productos, total, estado inicial y accesos a rastreo/cuenta. */
export function ConfirmationClient({ sessionId }: { sessionId: string | null }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(sessionId ? null : "Falta el identificador del pago. Revisa tu correo de confirmación.");

  useEffect(() => {
    if (!sessionId) return;
    void getStoreApi().orderConfirmation(sessionId).then((result) => (result.ok ? setOrder(result.data) : setError(result.error.message)));
  }, [sessionId]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-danger/10 text-danger"><AlertIcon className="size-6" /></span>
        <h1 className="mt-6 font-serif text-4xl font-medium">No pudimos mostrar tu pedido.</h1>
        <p className="mt-3 text-muted">{error}</p>
        <ButtonLink href="/rastrear-pedido" className="mt-8">Rastrear pedido</ButtonLink>
      </div>
    );
  }
  if (!order) return <p role="status" className="flex items-center gap-3 py-16 text-muted"><Spinner className="size-5" /> Confirmando tu pedido…</p>;

  const paid = order.paymentStatus === "paid";
  return (
    <div className="space-y-12">
      <header className="animate-rise">
        <span aria-hidden="true" className={`grid size-12 place-items-center rounded-full ${paid ? "bg-success text-on-ink" : "bg-sand text-warning"}`}><CheckIcon className="animate-pop size-6" /></span>
        <p className="eyebrow mt-6 text-muted">{paid ? "¡Gracias por tu compra!" : PAYMENT_TEXT[order.paymentStatus]}</p>
        <h1 className="mt-3 font-serif text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-medium">{paid ? <>Tu pedido está <em className="font-normal">confirmado</em>.</> : "Estamos confirmando tu pago."}</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">Te enviamos un correo a <strong className="text-fg">{order.email}</strong> con tu número de pedido.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={`/rastrear-pedido?pedido=${encodeURIComponent(order.orderNumber)}`}>Rastrear mi pedido</ButtonLink>
          <ButtonLink href="/productos" variant="outline" arrow={false}>Seguir comprando</ButtonLink>
        </div>
      </header>

      <div className="border-y border-border py-8"><OrderSteps order={order} /></div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="detalle" className="border border-border bg-[#fffdf9] p-6 sm:p-8">
          <h2 id="detalle" className="eyebrow text-muted">Detalles de tu pedido</h2>
          <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Número de pedido</dt><dd className="font-mono">{order.orderNumber}</dd>
            <dt className="text-muted">Fecha</dt><dd>{formatDate(order.createdAt)}</dd>
            <dt className="text-muted">Pago</dt><dd>{PAYMENT_TEXT[order.paymentStatus]}</dd>
          </dl>
          <div className="mt-6 border-t border-border pt-6"><DeliveryInfo order={order} /></div>
        </section>
        <section aria-labelledby="productos-pedido" className="self-start">
          <h2 id="productos-pedido" className="eyebrow mb-5 text-muted">Productos</h2>
          <OrderLines order={order} />
        </section>
      </div>

      <p className="flex items-start gap-3 border border-border bg-surface px-5 py-4 text-sm">
        <MailIcon className="mt-0.5 size-5 shrink-0 text-fg/60" />
        {order.delivery.method === "pickup" ? "Te avisaremos por correo cuando tu pedido esté LISTO PARA RECOGER. Espera ese aviso antes de acudir." : "Te enviaremos la guía de rastreo cuando tu pedido salga."} ¿Requieres factura? Solicítala respondiendo a tu correo de confirmación.
      </p>
    </div>
  );
}
