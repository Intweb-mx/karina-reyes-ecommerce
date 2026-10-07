"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Card, EmptyState, PageHeader, secondaryButtonClass, Stat, inputClass } from "@/app/panel/ui";
import { AlertIcon, MapPinIcon, SearchIcon, TruckIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreAdminApi } from "@/lib/store/admin";
import type { AdminDashboard, AdminOrderFilter, AdminOrdersResponse, AdminOrderSummary, AdminPeriod } from "@/lib/store/admin-contract";
import { formatMoney } from "@/lib/format";
import { FILTERS, FULFILLMENT_LABEL, FULFILLMENT_TONE, PAYMENT_LABEL, PAYMENT_TONE, shortDate } from "./labels";

const PERIODS: { id: AdminPeriod; label: string }[] = [
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "all", label: "Todo" },
];

/** Inicio del panel de la tienda: qué hay que atender hoy, cómo van las ventas y todos los pedidos con filtros. */
export function StoreAdminOverview() {
  const api = getStoreAdminApi();
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState<AdminPeriod>("30d");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [filter, setFilter] = useState<AdminOrderFilter>("to_ship");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void api.dashboard(period).then((result) => active && (result.ok ? setDashboard(result.data) : setError(result.error.message)));
    return () => {
      active = false;
    };
  }, [api, period]);

  // Búsqueda con pausa corta para no consultar en cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indica la consulta en curso
    setLoading(true);
    void api.orders({ filter, search: query || undefined }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) setData(result.data);
      else setError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [api, filter, query]);

  function exportCsv() {
    const url = api.exportOrdersUrl({ filter, search: query || undefined });
    if (url) return void window.location.assign(url);
    // Simulación: CSV con lo que está en pantalla.
    const rows = [["Folio", "Fecha", "Cliente", "Correo", "Piezas", "Total", "Pago", "Entrega", "Estado"], ...(data?.orders ?? []).map((o) => [o.orderNumber, o.createdAt, o.customerName, o.email, String(o.units), (o.total.amount / 100).toFixed(2), PAYMENT_LABEL[o.paymentStatus], o.deliveryMethod === "pickup" ? "Recolección" : "Envío", FULFILLMENT_LABEL[o.fulfillmentStatus]])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `pedidos-tienda-${filter}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const today = new Date(now).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" });
  const pending = dashboard ? dashboard.toShip + dashboard.toPickup : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tienda"
        subtitle={<span className="first-letter:uppercase">{today}</span>}
        actions={
          <div role="group" aria-label="Periodo de las métricas" className="inline-flex border border-border bg-[#fffdf9]">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={`min-h-10 px-3.5 text-sm transition-colors ${period === p.id ? "bg-fg text-bg" : "hover:bg-surface"}`}>
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <p role="alert" className="border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Por atender" value={pending ?? "—"} hint={pending ? `${dashboard!.toShip} por enviar · ${dashboard!.toPickup} por recoger` : "Todo al día"} tone={pending ? "attention" : "good"} />
        <Stat label="Ventas pagadas" value={dashboard ? formatMoney(dashboard.sales.amount, dashboard.sales.currency) : "—"} hint="Incluye envío, sin reembolsos" />
        <Stat label="Pedidos pagados" value={dashboard?.orders ?? "—"} />
        <Stat label="Ticket promedio" value={dashboard?.averageTicket ? formatMoney(dashboard.averageTicket.amount, dashboard.averageTicket.currency) : "—"} />
      </div>

      {dashboard && (dashboard.exceptions > 0 || dashboard.lowStock > 0 || dashboard.newLeads > 0) && (
        <ul className="grid gap-3 md:grid-cols-3">
          {dashboard.exceptions > 0 && (
            <AttentionItem tone="bad" onClick={() => setFilter("exception")}>
              {dashboard.exceptions} {dashboard.exceptions === 1 ? "pedido con incidencia" : "pedidos con incidencia"}
            </AttentionItem>
          )}
          {dashboard.lowStock > 0 && (
            <AttentionItem tone="attention" href="/panel/tienda/productos">
              {dashboard.lowStock} {dashboard.lowStock === 1 ? "producto con poco inventario" : "productos con poco inventario"}
            </AttentionItem>
          )}
          {dashboard.newLeads > 0 && (
            <AttentionItem tone="info" href="/panel/tienda/solicitudes">
              {dashboard.newLeads} {dashboard.newLeads === 1 ? "solicitud nueva" : "solicitudes nuevas"} (contacto o iglesias)
            </AttentionItem>
          )}
        </ul>
      )}

      <Card
        title="Pedidos"
        description="Lo que espera acción aparece primero, del más antiguo al más reciente."
        actions={
          <button type="button" onClick={exportCsv} className={secondaryButtonClass} disabled={!data?.orders.length}>
            Descargar CSV
          </button>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 mt-0.5 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="buscar-pedido" className="sr-only">Buscar pedido</label>
            <input id="buscar-pedido" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por folio, nombre, correo o guía" className={`${inputClass} mt-0 pl-10`} />
          </div>
          <div role="group" aria-label="Filtrar pedidos" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {FILTERS.map((f) => {
              const count = data?.counts[f.id];
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${active ? "border-fg bg-fg text-bg" : "border-border bg-bg hover:border-fg/40"}`}
                >
                  {f.label}
                  {count !== undefined && <span className={`rounded-full px-1.5 text-xs lining-nums ${active ? "bg-bg/20" : "bg-surface"}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {loading && !data ? (
            <p className="flex items-center gap-2 py-8 text-sm text-muted"><Spinner className="size-4" /> Cargando pedidos…</p>
          ) : !data?.orders.length ? (
            <EmptyState title={query ? "Ningún pedido coincide con la búsqueda." : "No hay pedidos en esta lista."} body={filter === "to_ship" || filter === "to_pickup" ? "Todo al día. Aparecerán aquí en cuanto entren pagos." : undefined} />
          ) : (
            <ul aria-busy={loading} className={`-mx-5 divide-y divide-border border-t border-border transition-opacity ${loading ? "opacity-60" : ""}`}>
              {data.orders.map((order) => <OrderRow key={order.orderNumber} order={order} now={now} />)}
            </ul>
          )}
        </div>
      </Card>

      {dashboard && dashboard.topProducts.length > 0 && (
        <Card title="Más vendidos" description="Piezas pagadas en el periodo.">
          <ul className="space-y-2 text-sm">
            {dashboard.topProducts.map((p) => (
              <li key={p.name} className="flex justify-between gap-4"><span>{p.name}</span><span className="font-semibold lining-nums">{p.units} {p.units === 1 ? "pieza" : "piezas"}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AttentionItem({ tone, href, onClick, children }: { tone: "bad" | "attention" | "info"; href?: string; onClick?: () => void; children: ReactNode }) {
  const color = tone === "bad" ? "border-l-danger" : tone === "attention" ? "border-l-warning" : "border-l-ink/40";
  const className = `flex w-full items-center justify-between gap-3 border border-l-4 border-border bg-[#fffdf9] px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-surface ${color}`;
  const body = (
    <>
      <span className="flex items-center gap-2"><AlertIcon className="size-4 shrink-0 text-fg/60" /> {children}</span>
      <span aria-hidden="true" className="text-bronze">→</span>
    </>
  );
  return <li>{href ? <Link href={href} className={className}>{body}</Link> : <button type="button" onClick={onClick} className={className}>{body}</button>}</li>;
}

function OrderRow({ order, now }: { order: AdminOrderSummary; now: number }) {
  const waitingDays = order.waitingSince ? Math.floor((now - Date.parse(order.waitingSince)) / 86_400_000) : 0;
  const paid = order.paymentStatus === "paid";
  return (
    <li>
      <Link href={`/panel/tienda/pedidos/${encodeURIComponent(order.orderNumber)}`} className="group grid gap-x-4 gap-y-1.5 px-5 py-3.5 text-sm transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {order.customerName}
            {waitingDays >= 2 && <Badge tone="attention">{waitingDays} días esperando</Badge>}
          </p>
          <p className="mt-0.5 truncate text-muted">
            <span className="font-mono">{order.orderNumber}</span> · {shortDate(order.createdAt)} · {order.units} {order.units === 1 ? "pieza" : "piezas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-muted" title={order.deliveryMethod === "pickup" ? "Recolección" : "Envío"}>
            {order.deliveryMethod === "pickup" ? <MapPinIcon className="size-4" /> : <TruckIcon className="size-4" />}
            <span className="sr-only">{order.deliveryMethod === "pickup" ? "Recolección" : "Envío"}</span>
          </span>
          {paid ? <Badge tone={FULFILLMENT_TONE[order.fulfillmentStatus]}>{FULFILLMENT_LABEL[order.fulfillmentStatus]}</Badge> : <Badge tone={PAYMENT_TONE[order.paymentStatus]}>{PAYMENT_LABEL[order.paymentStatus]}</Badge>}
        </div>
        <p className="flex items-center justify-between gap-3 font-semibold lining-nums tabular-nums sm:justify-end">
          {formatMoney(order.total.amount, order.total.currency)}
          <span aria-hidden="true" className="text-bronze transition-transform group-hover:translate-x-0.5">→</span>
        </p>
      </Link>
    </li>
  );
}
