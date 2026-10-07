"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, buttonClass, Card, inputClass, PageHeader, secondaryButtonClass } from "@/app/panel/ui";
import { ChatIcon, MailIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreAdminApi } from "@/lib/store/admin";
import type { AdminOrderAction, AdminOrderDetail } from "@/lib/store/admin-contract";
import { DeliveryInfo, OrderLines, OrderSteps } from "../order/OrderParts";
import { ACTIONS, dateTime, FULFILLMENT_LABEL, FULFILLMENT_TONE, PAYMENT_LABEL, PAYMENT_TONE } from "./labels";

/**
 * Detalle de un pedido de la tienda: el siguiente paso arriba y en grande, luego cliente, entrega,
 * productos, notas internas y la bitácora completa. Solo se muestran las acciones que el backend permite.
 */
export function AdminOrderView({ orderNumber }: { orderNumber: string }) {
  const api = getStoreAdminApi();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState<AdminOrderAction | null>(null);
  const [confirming, setConfirming] = useState<AdminOrderAction | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    void api.order(orderNumber).then((result) => (result.ok ? setOrder(result.data) : setError(result.error.message)));
  }, [api, orderNumber]);

  async function run(action: AdminOrderAction, actionNote?: string) {
    setRunning(action);
    setMessage(null);
    setError(null);
    const result = await api.orderAction(orderNumber, { action, note: actionNote || undefined }, crypto.randomUUID());
    setRunning(null);
    setConfirming(null);
    setNote("");
    if (result.ok) {
      setOrder(result.data);
      setMessage(`Listo: ${ACTIONS[action].label.toLowerCase()}.`);
    } else setError(result.error.message);
  }

  if (!order) {
    return error ? <Alert>{error}</Alert> : <p className="flex items-center gap-2 py-10 text-sm text-muted"><Spinner className="size-4" /> Cargando pedido…</p>;
  }

  const primary = order.allowedActions.filter((a) => ACTIONS[a].primary);
  const secondary = order.allowedActions.filter((a) => !ACTIONS[a].primary);
  const paid = order.paymentStatus === "paid";
  const whatsapp = order.phone ? `https://wa.me/52${order.phone.replace(/\D/g, "").slice(-10)}` : null;

  return (
    <div className="space-y-8">
      <PageHeader
        back={<Link href="/panel/tienda" className="hover:text-fg">← Pedidos de la tienda</Link>}
        title={<span className="font-mono text-[0.85em]">{order.orderNumber}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {order.customerName} · {dateTime(order.createdAt)}
            <Badge tone={PAYMENT_TONE[order.paymentStatus]}>{PAYMENT_LABEL[order.paymentStatus]}</Badge>
            {paid && <Badge tone={FULFILLMENT_TONE[order.fulfillmentStatus]}>{FULFILLMENT_LABEL[order.fulfillmentStatus]}</Badge>}
          </span>
        }
      />

      <div aria-live="polite">{message && <Alert tone="ok">{message}</Alert>}{error && <Alert>{error}</Alert>}</div>

      {order.allowedActions.length > 0 && (
        <section aria-labelledby="siguiente-paso" className="border border-l-4 border-border border-l-bronze bg-[#fffdf9] p-5 sm:p-6">
          <h2 id="siguiente-paso" className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Siguiente paso</h2>
          {primary.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
              {primary.map((action) => (
                <button key={action} type="button" onClick={() => void run(action)} disabled={!!running} className={`${buttonClass} min-h-12 px-5`}>
                  {running === action && <Spinner className="size-4" />}
                  {ACTIONS[action].label}
                </button>
              ))}
              <p className="max-w-md text-sm text-muted">{ACTIONS[primary[0]!].help}</p>
            </div>
          )}
          {secondary.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {secondary.map((action) => (
                <button
                  key={action}
                  type="button"
                  title={ACTIONS[action].help}
                  onClick={() => (ACTIONS[action].confirm ? setConfirming(action) : void run(action))}
                  disabled={!!running}
                  className={`${secondaryButtonClass} ${ACTIONS[action].danger ? "text-danger hover:border-danger/50" : ""}`}
                >
                  {running === action && <Spinner className="size-4" />}
                  {ACTIONS[action].label}
                </button>
              ))}
            </div>
          )}
          {confirming && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(confirming, note.trim());
              }}
              className="animate-rise mt-4 space-y-3 border border-border bg-surface p-4 [animation-duration:300ms]"
            >
              <p className="text-sm font-medium">{ACTIONS[confirming].confirm}</p>
              <label className="block text-sm">
                Nota (opcional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={!!running} className={`${buttonClass} ${ACTIONS[confirming].danger ? "bg-danger hover:bg-danger/85" : ""}`}>
                  {running && <Spinner className="size-4" />} Sí, {ACTIONS[confirming].label.toLowerCase()}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className={secondaryButtonClass}>No, regresar</button>
              </div>
            </form>
          )}
        </section>
      )}

      {paid && (
        <div className="border border-border bg-[#fffdf9] px-4 py-6 sm:px-6"><OrderSteps order={order} /></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-6">
          <Card title="Entrega">
            <DeliveryInfo order={order} />
            {order.labelUrl && (
              <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClass} mt-4`}>Imprimir guía</a>
            )}
          </Card>
          <Card title="Productos">
            <OrderLines order={order} />
          </Card>
          <Card title="Historial" description="Todo lo que ha pasado con el pedido. No se puede borrar.">
            <ol className="relative space-y-4 border-l border-border pl-5 text-sm">
              {[...order.timeline].reverse().map((event, index) => (
                <li key={`${event.at}-${index}`} className="relative">
                  <span aria-hidden="true" className="absolute top-1.5 -left-[1.6875rem] size-2.5 rounded-full border-2 border-[#fffdf9] bg-fg/50" />
                  <p className="font-medium">{event.label}</p>
                  <p className="text-xs text-muted">{dateTime(event.at)}{event.actor ? ` · ${event.actor}` : ""}</p>
                  {event.note && <p className="mt-1 text-muted">“{event.note}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Cliente">
            <div className="space-y-3 text-sm">
              <p className="font-semibold">{order.customerName}</p>
              <p className="flex flex-col gap-2">
                <a href={`mailto:${order.email}?subject=${encodeURIComponent(`Tu pedido ${order.orderNumber}`)}`} className="inline-flex items-center gap-2 break-all underline-offset-4 hover:underline"><MailIcon className="size-4 shrink-0" /> {order.email}</a>
                {order.phone && whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 underline-offset-4 hover:underline"><ChatIcon className="size-4 shrink-0" /> {order.phone} (WhatsApp)</a>
                )}
              </p>
              <p className="text-xs text-muted">Noticias por correo: {order.marketingConsent ? "aceptó" : "no aceptó"}.</p>
            </div>
          </Card>
          <NotesCard order={order} onSaved={setOrder} />
        </div>
      </div>
    </div>
  );
}

function NotesCard({ order, onSaved }: { order: AdminOrderDetail; onSaved: (order: AdminOrderDetail) => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const result = await getStoreAdminApi().addOrderNote(order.orderNumber, { text: text.trim() });
    setSaving(false);
    if (result.ok) {
      onSaved(result.data);
      setText("");
      setError(null);
    } else setError(result.error.message);
  }

  return (
    <Card title="Notas internas" description="Solo las ve el equipo.">
      {order.notes.length > 0 && (
        <ul className="mb-4 space-y-3 text-sm">
          {order.notes.map((n, i) => (
            <li key={`${n.at}-${i}`} className="border-l-2 border-bronze/50 pl-3">
              <p>{n.text}</p>
              <p className="mt-0.5 text-xs text-muted">{n.author} · {dateTime(n.at)}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor="nota" className="sr-only">Nueva nota</label>
        <textarea id="nota" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Ej.: el cliente pidió entregar después de las 5 p.m." className={inputClass} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={saving || !text.trim()} className={secondaryButtonClass}>
          {saving && <Spinner className="size-4" />} Guardar nota
        </button>
      </form>
    </Card>
  );
}
