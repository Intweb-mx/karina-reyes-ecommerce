"use client";

import { useState, type FormEvent } from "react";
import type { OrderView } from "@/lib/store/contract";
import { Button } from "@/components/ui/Button";
import { Field } from "../forms/Field";
import { EMAIL } from "../forms/useStoreForm";
import { SupportChannels } from "../SupportChannels";
import { getStoreApi } from "@/lib/store/api";
import { DeliveryInfo, FULFILLMENT_TEXT, OrderEvents, OrderLines, OrderSteps } from "./OrderParts";

/** 12 · Rastrear pedido: consulta segura por número de pedido + correo; solo eventos reales. */
export function TrackOrder({ initialOrderNumber = "" }: { initialOrderNumber?: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const orderNumber = String(form.get("orderNumber") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const e: Record<string, string[]> = {};
    if (!orderNumber) e.orderNumber = ["Escribe tu número de pedido."];
    if (!EMAIL.test(email)) e.email = ["Correo no válido."];
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setLoading(true);
    const result = await getStoreApi().trackOrder({ orderNumber, email });
    setLoading(false);
    if (result.ok) setOrder(result.data);
    else {
      setOrder(null);
      setFormError(result.error.message);
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 border border-border bg-[#fffdf9] p-6 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-8">
        <Field name="orderNumber" label="Número de pedido" defaultValue={initialOrderNumber} placeholder="Ej.: INT-…" autoCapitalize="characters" errors={errors.orderNumber} />
        <Field name="email" label="Correo de la compra" type="email" autoComplete="email" errors={errors.email} />
        <Button type="submit" arrow="right" loading={loading} disabled={loading} className="sm:mb-0">{loading ? "Buscando…" : "Rastrear pedido"}</Button>
        {formError && <p role="alert" className="text-sm text-danger sm:col-span-3">{formError}</p>}
        <p className="text-xs text-muted sm:col-span-3">Por seguridad pedimos ambos datos. ¿No encuentras tu número de pedido? Está en tu correo de confirmación.</p>
      </form>

      {order && (
        <section aria-labelledby="pedido-encontrado" className="animate-rise space-y-8 border border-border bg-[#fffdf9] p-6 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="pedido-encontrado" className="font-serif text-3xl font-medium">Pedido <span className="font-mono text-2xl">{order.orderNumber}</span></h2>
              <p className="mt-1 text-sm text-muted">Realizado el {new Date(order.createdAt).toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" })}</p>
            </div>
            <span className="rounded-full border border-success/40 bg-success/15 px-3 py-1 text-sm font-medium text-success">{FULFILLMENT_TEXT[order.fulfillmentStatus]}</span>
          </header>
          <OrderSteps order={order} />
          <div className="grid gap-8 border-t border-border pt-8 md:grid-cols-3">
            <div><h3 className="eyebrow mb-4 text-muted">Entrega</h3><DeliveryInfo order={order} /></div>
            <div><h3 className="eyebrow mb-4 text-muted">Productos</h3><OrderLines order={order} /></div>
            <div><h3 className="eyebrow mb-4 text-muted">Movimientos</h3><OrderEvents order={order} /></div>
          </div>
          <div className="border-t border-border pt-6">
            <p className="font-semibold">¿Necesitas ayuda con tu pedido?</p>
            <div className="mt-3"><SupportChannels /></div>
          </div>
        </section>
      )}
    </div>
  );
}
