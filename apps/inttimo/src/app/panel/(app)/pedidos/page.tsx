import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { ORDER_TAB_LABELS, ORDER_TABS, type OrderQuery } from "@/server/admin/contract";
import { parseOrderQuery, searchOrders } from "@/server/admin/orders";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Badge, Card, DELIVERY_LABELS, EmptyState, FULFILLMENT_LABELS, FULFILLMENT_TONES, inputClass, PageHeader, secondaryButtonClass, STATUS_LABELS, STATUS_TONES } from "../../ui";

export const metadata = { title: "Pedidos" };

function hrefFor(query: OrderQuery, overrides: Partial<OrderQuery>): string {
  const next = { ...query, page: 1, ...overrides };
  const params = new URLSearchParams({ tab: next.tab, pagina: String(next.page) });
  if (next.q) params.set("q", next.q);
  if (next.deliveryMethod) params.set("entrega", next.deliveryMethod);
  if (next.campaignId) params.set("campana", next.campaignId);
  return `/panel/pedidos?${params}`;
}

export default async function OrdersPage({ searchParams }: PageProps<"/panel/pedidos">) {
  await requireAdmin();
  const query = parseOrderQuery(await searchParams);
  const list = await searchOrders(getDb(), query);
  const campaign = list.campaigns.find((c) => c.id === query.campaignId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle={campaign ? `Solo ${campaign.productName}` : "Todas las preventas"}
        actions={
          campaign && (
            <a href={`/panel/campanas/${campaign.slug}/export`} className={secondaryButtonClass}>
              Descargar lista (Excel)
            </a>
          )
        }
      />

      <nav aria-label="Estado de los pedidos" className="flex gap-2 overflow-x-auto pb-1">
        {ORDER_TABS.map((tab) => (
          <Link
            key={tab}
            href={hrefFor(query, { tab })}
            aria-current={tab === query.tab ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 border px-3 text-sm ${tab === query.tab ? "border-fg bg-fg text-bg" : "border-border hover:border-fg/40"}`}
          >
            {ORDER_TAB_LABELS[tab]}
            <span className="tabular-nums opacity-70">{list.counts[tab]}</span>
          </Link>
        ))}
      </nav>

      <Card>
        <form action="/panel/pedidos" className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={query.tab} />
          <label className="min-w-60 flex-1 text-sm font-medium">
            Buscar
            <input name="q" defaultValue={query.q} placeholder="Nombre, correo, teléfono, folio o guía" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Entrega
            <select name="entrega" defaultValue={query.deliveryMethod ?? ""} className={inputClass}>
              <option value="">Todas</option>
              <option value="shipping">{DELIVERY_LABELS.shipping}</option>
              <option value="pickup">{DELIVERY_LABELS.pickup}</option>
            </select>
          </label>
          {list.campaigns.length > 1 && (
            <label className="text-sm font-medium">
              Preventa
              <select name="campana" defaultValue={query.campaignId ?? ""} className={inputClass}>
                <option value="">Todas</option>
                {list.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.productName} ({c.slug})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={secondaryButtonClass}>
            Buscar
          </button>
          {(query.q || query.deliveryMethod || query.campaignId) && (
            <Link href={hrefFor(query, { q: undefined, deliveryMethod: undefined, campaignId: undefined })} className="min-h-11 py-2.5 text-sm text-muted underline underline-offset-4">
              Limpiar
            </Link>
          )}
        </form>

        {list.rows.length === 0 ? (
          <EmptyState title="No hay pedidos con estos filtros." />
        ) : (
          <ul className="-my-2 divide-y divide-border">
            {list.rows.map((row) => {
              const paid = row.status === "paid" || row.status === "partially_refunded";
              return (
                <li key={row.id}>
                  <Link href={`/panel/pedidos/${row.id}`} className="-mx-2 grid gap-2 px-2 py-3 text-sm transition-colors hover:bg-surface sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-semibold">{row.fullName}</p>
                      <p className="mt-0.5 truncate text-muted">
                        <span className="font-mono">{row.code}</span> · {row.email} · {row.quantity} {row.quantity === 1 ? "pieza" : "piezas"} · {formatMoney(row.totalAmount, row.currency)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                      <Badge tone="neutral">{DELIVERY_LABELS[row.deliveryMethod]}</Badge>
                      {paid && <Badge tone={FULFILLMENT_TONES[row.fulfillmentStatus]}>{FULFILLMENT_LABELS[row.fulfillmentStatus]}</Badge>}
                      <span className="text-xs text-muted">{row.createdAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" })}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>{list.total} pedidos</span>
          <span className="flex items-center gap-2">
            {list.page > 1 && (
              <Link href={hrefFor(query, { page: list.page - 1 })} className={secondaryButtonClass}>
                ← Anterior
              </Link>
            )}
            <span>
              Página {list.page} de {list.pages}
            </span>
            {list.page < list.pages && (
              <Link href={hrefFor(query, { page: list.page + 1 })} className={secondaryButtonClass}>
                Siguiente →
              </Link>
            )}
          </span>
        </div>
      </Card>
    </div>
  );
}
