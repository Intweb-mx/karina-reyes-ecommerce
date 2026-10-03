import { getCampaignBySlug, getCampaignStats, searchReservations, type ReservationStatus } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card, inputClass, secondaryButtonClass, Stat, STATUS_LABELS, DELIVERY_LABELS, FULFILLMENT_LABELS } from "../../../ui";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/panel" className="text-sm text-muted">← Inicio</Link>
          <h1 className="mt-1 font-serif text-3xl">{campaign.productName}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/panel/campanas/${slug}/editar`} className={secondaryButtonClass}>Editar preventa</Link>
          <a href={exportHref} className={secondaryButtonClass}>Descargar lista (Excel)</a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Pedidos pagados" value={stats.paidReservations} />
        <Stat label="Piezas pagadas" value={stats.paidUnits} />
        <Stat label="Ventas (sin reembolsos)" value={formatMoney(stats.netRevenue, campaign.currency)} />
        <Stat label="Procesando (OXXO)" value={stats.byStatus.processing ?? 0} />
      </div>

      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3" action={`/panel/campanas/${slug}`}>
          <label className="min-w-60 flex-1 text-sm">
            Buscar por nombre, correo o folio
            <input name="q" defaultValue={q} className={inputClass} />
          </label>
          <label className="text-sm">
            Estado del pago
            <select name="estado" defaultValue={status} className={inputClass}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]} ({stats.byStatus[s] ?? 0})</option>
              ))}
            </select>
          </label>
          <button type="submit" className={secondaryButtonClass}>Filtrar</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">Folio</th>
                <th className="py-2 pr-4 font-normal">Nombre</th>
                <th className="py-2 pr-4 font-normal">Correo</th>
                <th className="py-2 pr-4 font-normal">Piezas</th>
                <th className="py-2 pr-4 font-normal">Total</th>
                <th className="py-2 pr-4 font-normal">Pago</th>
                <th className="py-2 pr-4 font-normal">Entrega</th>
                <th className="py-2 font-normal">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-mono">
                    <Link href={`/panel/reservas/${r.id}`} className="underline underline-offset-4">{r.code}</Link>
                  </td>
                  <td className="py-2 pr-4">{r.fullName}</td>
                  <td className="py-2 pr-4">{r.email}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.quantity}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatMoney(r.totalAmount, r.currency)}</td>
                  <td className="py-2 pr-4">{STATUS_LABELS[r.status]}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {DELIVERY_LABELS[r.deliveryMethod]}
                    {(r.status === "paid" || r.status === "partially_refunded") && <span className="block text-xs text-muted">{FULFILLMENT_LABELS[r.fulfillmentStatus]}</span>}
                  </td>
                  <td className="py-2 whitespace-nowrap text-muted">{r.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">No hay pedidos con esta búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{total} pedidos</span>
          <span className="flex gap-3">
            {page > 1 && <Link href={link({ pagina: page - 1 })} className="underline underline-offset-4">← Anterior</Link>}
            <span>Página {page} de {pages}</span>
            {page < pages && <Link href={link({ pagina: page + 1 })} className="underline underline-offset-4">Siguiente →</Link>}
          </span>
        </div>
      </Card>
    </div>
  );
}
