import { getCampaignStats, listCampaigns, searchReservations } from "@inttimo/database";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getPhase } from "@/server/presale/campaign";
import { getDb } from "@/server/presale/runtime";
import { WelcomeTip } from "./WelcomeTip";
import { Badge, buttonClass, Card, daysSince, EmptyState, PageHeader, secondaryButtonClass, Stat } from "../ui";

export const metadata = { title: "Hoy" };

const PHASE = { upcoming: "Por abrir", open: "Abierta", closed: "Cerrada" } as const;

type Pending = { id: string; code: string; fullName: string; quantity: number; campaign: string; paidAt: Date };

export default async function PanelHome() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const campaigns = await Promise.all(
    (await listCampaigns(db)).map(async (campaign) => ({
      campaign,
      stats: await getCampaignStats(db, campaign.id),
      paid: (await searchReservations(db, campaign.id, { statuses: ["paid", "partially_refunded"], limit: 1000, offset: 0 })).rows,
    })),
  );

  const toShip: Pending[] = [];
  const toPickup: Pending[] = [];
  for (const { campaign, paid } of campaigns) {
    for (const r of paid) {
      if (r.fulfillmentStatus !== "pending") continue;
      const item = { id: r.id, code: r.code, fullName: r.fullName, quantity: r.quantity, campaign: campaign.productName, paidAt: r.paidAt ?? r.createdAt };
      (r.deliveryMethod === "shipping" ? toShip : toPickup).push(item);
    }
  }
  const byOldest = (a: Pending, b: Pending) => a.paidAt.getTime() - b.paidAt.getTime();
  toShip.sort(byOldest);
  toPickup.sort(byOldest);

  const totals = campaigns.reduce(
    (acc, { campaign, stats }) => ({ orders: acc.orders + stats.paidReservations, units: acc.units + stats.paidUnits, revenue: acc.revenue + stats.netRevenue, currency: campaign.currency }),
    { orders: 0, units: 0, revenue: 0, currency: "mxn" },
  );
  const greeting = now.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-10">
      <PageHeader title="Hoy" subtitle={<span className="first-letter:uppercase">{greeting} · Lo que hay que atender, del pedido más antiguo al más reciente.</span>} />
      <WelcomeTip />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Por enviar" value={toShip.length} hint={toShip.length ? "Generar guía e imprimir" : "Todo al día"} tone={toShip.length ? "attention" : "good"} />
        <Stat label="Por preparar para recoger" value={toPickup.length} hint={toPickup.length ? "Avisar cuando esté listo" : "Todo al día"} tone={toPickup.length ? "attention" : "good"} />
        <Stat label="Pedidos pagados" value={totals.orders} hint={`${totals.units} ${totals.units === 1 ? "pieza" : "piezas"}`} />
        <Stat label="Ventas (sin reembolsos)" value={formatMoney(totals.revenue, totals.currency)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Por enviar · ${toShip.length}`} description="Los más antiguos primero. Abre el pedido, genera la guía e imprímela.">
          <PendingList items={toShip} action="Generar guía" empty="No hay pedidos por enviar." now={now} />
        </Card>
        <Card title={`Para recoger · ${toPickup.length}`} description="Cuando el pedido esté listo, ábrelo y avisa al cliente.">
          <PendingList items={toPickup} action="Avisar que está listo" empty="No hay pedidos por preparar para recolección." now={now} />
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">Preventas</h2>
        {campaigns.length === 0 && <EmptyState title="Todavía no hay preventas." />}
        {campaigns.map(({ campaign, stats }) => {
          const phase = campaign.status === "draft" ? null : getPhase(campaign, now);
          return (
            <Card
              key={campaign.id}
              title={campaign.productName}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Link href={`/panel/campanas/${campaign.slug}/editar`} className={secondaryButtonClass}>
                    Editar
                  </Link>
                  <Link href={`/panel/campanas/${campaign.slug}`} className={buttonClass}>
                    Ver pedidos
                  </Link>
                </div>
              }
            >
              <dl className="grid gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Estado</dt>
                  <dd className="mt-1">
                    <Badge tone={phase === "open" ? "good" : phase === "upcoming" ? "attention" : "neutral"}>{phase ? PHASE[phase] : "Oculta"}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Cierra</dt>
                  <dd className="mt-1">{formatDate(campaign.endsAt.toISOString())}</dd>
                </div>
                <div>
                  <dt className="text-muted">Pedidos pagados</dt>
                  <dd className="mt-1 lining-nums tabular-nums">
                    {stats.paidReservations} ({stats.paidUnits} {stats.paidUnits === 1 ? "pieza" : "piezas"})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Ventas (sin reembolsos)</dt>
                  <dd className="mt-1 lining-nums tabular-nums">{formatMoney(stats.netRevenue, campaign.currency)}</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function PendingList({ items, action, empty, now }: { items: Pending[]; action: string; empty: string; now: Date }) {
  if (!items.length) return <EmptyState title={empty} body="Aparecerán aquí en cuanto entren pagos." />;
  return (
    <ul className="-my-2 divide-y divide-border">
      {items.map((item) => {
        const waiting = daysSince(item.paidAt, now);
        return (
          <li key={item.id}>
            <Link href={`/panel/reservas/${item.id}`} className="group -mx-2 flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm transition-colors hover:bg-surface">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {item.fullName}
                  {waiting >= 3 && <Badge tone="attention">{waiting} días esperando</Badge>}
                </p>
                <p className="mt-0.5 text-muted">
                  <span className="font-mono">{item.code}</span> · {item.quantity} {item.quantity === 1 ? "pieza" : "piezas"} · pagado el{" "}
                  {item.paidAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long" })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-bronze group-hover:underline group-hover:underline-offset-4">
                {action} →
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
