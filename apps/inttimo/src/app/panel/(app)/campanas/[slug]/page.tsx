import { getCampaignBySlug, getCampaignStats, searchReservations, type ReservationStatus } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Badge, buttonClass, Card, DELIVERY_LABELS, EmptyState, FULFILLMENT_LABELS, FULFILLMENT_TONES, inputClass, PageHeader, secondaryButtonClass, Stat, STATUS_LABELS, STATUS_TONES } from "../../../ui";

const PAGE_SIZE = 50;
const STATUSES = Object.keys(STATUS_LABELS) as ReservationStatus[];

export async function generateMetadata({ params }: PageProps<"/panel/campanas/[slug]">) {
  return { title: `Pedidos · ${(await params).slug}` };
}

export default async function CampaignPage({ params, searchParams }: PageProps<"/panel/campanas/[slug]">) {
  await requireAdmin();
  const { slug } = await params;
  const query = await searchParams;
  const db = getDb();
  const campaign = await getCampaignBySlug(db, slug);
  if (!campaign) notFound();

  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const status = typeof query.estado === "string" && STATUSES.includes(query.estado as ReservationStatus) ? (query.estado as ReservationStatus) : "";
  const page = Math.max(1, Number(query.pagina) || 1);

  const [stats, { rows, total }] = await Promise.all([
    getCampaignStats(db, campaign.id),
    searchReservations(db, campaign.id, { query: q, statuses: status ? [status] : undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(status && { estado: status }), pagina: String(page), ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) });
    return `/panel/campanas/${slug}?${params}`;
  };
  const exportHref = `/panel/campanas/${slug}/export${status ? `?estado=${status}` : ""}`;

  const fulfillable = (r: (typeof rows)[number]) => r.status === "paid" || r.status === "partially_refunded";
  const date = (d: Date) => d.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-8">
      <PageHeader
        back={<Link href="/panel" className="hover:text-fg">← Hoy</Link>}
        title={campaign.productName}
        subtitle="Todos los pedidos de esta preventa."
        actions={
          <>
            <Link href={`/panel/campanas/${slug}/editar`} className={secondaryButtonClass}>Editar preventa</Link>
            <a href={exportHref} className={secondaryButtonClass}>Descargar lista (Excel)</a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos pagados" value={stats.paidReservations} />
        <Stat label="Piezas pagadas" value={stats.paidUnits} />
        <Stat label="Ventas (sin reembolsos)" value={formatMoney(stats.netRevenue, campaign.currency)} />
        <Stat label="Pago en proceso (OXXO)" value={stats.byStatus.processing ?? 0} tone={(stats.byStatus.processing ?? 0) > 0 ? "attention" : "neutral"} />
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3" action={`/panel/campanas/${slug}`} role="search">
          <label className="min-w-0 flex-[1_1_16rem] text-sm font-medium">
            Buscar por nombre, correo o folio
            <input name="q" type="search" defaultValue={q} placeholder="Ej.: Ana, ana@correo.com o PV-…" className={inputClass} />
          </label>
          <label className="flex-[0_1_14rem] text-sm font-medium">
            Estado del pago
            <select name="estado" defaultValue={status} className={inputClass}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]} ({stats.byStatus[s] ?? 0})</option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass}>Buscar</button>
          {(q || status) && (
            <Link href={`/panel/campanas/${slug}`} className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-fg">
              Limpiar
            </Link>
          )}
        </form>

        <p className="mt-5 text-sm text-muted">
          {total} {total === 1 ? "pedido" : "pedidos"}
          {q && <> con «{q}»</>}
          {status && <> · {STATUS_LABELS[status]}</>}
        </p>

        {/* Celular: tarjetas */}
        <ul className="mt-3 divide-y divide-border border-y border-border md:hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/panel/reservas/${r.id}`} className="block py-3.5 transition-colors hover:bg-surface">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.fullName}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted">{r.code}</p>
                  </div>
                  <p className="shrink-0 font-semibold lining-nums tabular-nums">{formatMoney(r.totalAmount, r.currency)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  {fulfillable(r) && <Badge tone={FULFILLMENT_TONES[r.fulfillmentStatus]}>{FULFILLMENT_LABELS[r.fulfillmentStatus]}</Badge>}
                  <span className="text-xs text-muted">{DELIVERY_LABELS[r.deliveryMethod]} · {r.quantity} {r.quantity === 1 ? "pieza" : "piezas"}</span>
                </div>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="py-8"><EmptyState title="No hay pedidos con esta búsqueda." /></li>}
        </ul>

        {/* Escritorio: tabla */}
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-4 font-medium">Folio</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Cliente</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Piezas</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Total</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Pago</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Entrega</th>
                <th scope="col" className="py-2.5 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="group relative border-b border-border/60 transition-colors last:border-0 hover:bg-surface">
                  <td className="py-3 pr-4 font-mono text-xs">
                    {/* El enlace cubre toda la fila: se puede hacer clic en cualquier parte. */}
                    <Link href={`/panel/reservas/${r.id}`} className="underline-offset-4 after:absolute after:inset-0 group-hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block font-medium">{r.fullName}</span>
                    <span className="block text-xs text-muted">{r.email}</span>
                  </td>
                  <td className="py-3 pr-4 text-right lining-nums tabular-nums">{r.quantity}</td>
                  <td className="py-3 pr-4 text-right lining-nums tabular-nums">{formatMoney(r.totalAmount, r.currency)}</td>
                  <td className="py-3 pr-4"><Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge></td>
                  <td className="py-3 pr-4">
                    <span className="block whitespace-nowrap">{DELIVERY_LABELS[r.deliveryMethod]}</span>
                    {fulfillable(r) && <span className="mt-1 block"><Badge tone={FULFILLMENT_TONES[r.fulfillmentStatus]}>{FULFILLMENT_LABELS[r.fulfillmentStatus]}</Badge></span>}
                  </td>
                  <td className="py-3 whitespace-nowrap text-muted">{date(r.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8"><EmptyState title="No hay pedidos con esta búsqueda." /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav aria-label="Páginas" className="mt-5 flex items-center justify-between gap-3 text-sm">
            {page > 1 ? <Link href={link({ pagina: page - 1 })} className={secondaryButtonClass}>← Anterior</Link> : <span />}
            <span className="text-muted">Página {page} de {pages}</span>
            {page < pages ? <Link href={link({ pagina: page + 1 })} className={secondaryButtonClass}>Siguiente →</Link> : <span />}
          </nav>
        )}
      </Card>
    </div>
  );
}
