import { getCampaignStats, listCampaigns, searchReservations } from "@inttimo/database";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getPhase } from "@/server/presale/campaign";
import { getDb } from "@/server/presale/runtime";
import { buttonClass, Card, secondaryButtonClass } from "../ui";

export const metadata = { title: "Inicio" };

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

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl">Inicio</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Pedidos por enviar (${toShip.length})`}>
          <p className="mb-4 text-sm text-muted">Los más antiguos van primero. Abre el pedido, genera la guía y luego imprímela.</p>
          <PendingList items={toShip} action="Generar guía" empty="No hay pedidos por enviar." />
        </Card>
        <Card title={`Pedidos para recoger (${toPickup.length})`}>
          <p className="mb-4 text-sm text-muted">Cuando el pedido esté listo, ábrelo y avisa al cliente.</p>
          <PendingList items={toPickup} action="Avisar que está listo" empty="No hay pedidos por preparar para recolección." />
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Preventas</h2>
        {campaigns.length === 0 && (
          <Card>
            <p className="text-sm text-muted">Todavía no hay preventas.</p>
          </Card>
        )}
        {campaigns.map(({ campaign, stats }) => (
          <Card
            key={campaign.id}
            title={campaign.productName}
            actions={
              <Link href={`/panel/campanas/${campaign.slug}`} className={secondaryButtonClass}>
                Ver todos los pedidos
              </Link>
            }
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Estado</dt>
                <dd>{campaign.status === "draft" ? "Oculta" : PHASE[getPhase(campaign, now)]}</dd>
              </div>
              <div>
                <dt className="text-muted">Cierra</dt>
                <dd>{formatDate(campaign.endsAt.toISOString())}</dd>
              </div>
              <div>
                <dt className="text-muted">Pedidos pagados</dt>
                <dd className="tabular-nums">
                  {stats.paidReservations} ({stats.paidUnits} {stats.paidUnits === 1 ? "pieza" : "piezas"})
                </dd>
              </div>
              <div>
                <dt className="text-muted">Ventas (sin reembolsos)</dt>
                <dd className="tabular-nums">{formatMoney(stats.netRevenue, campaign.currency)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </section>
    </div>
  );
}

function PendingList({ items, action, empty }: { items: Pending[]; action: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div>
            <p className="font-semibold">{item.fullName}</p>
            <p className="text-muted">
              Folio {item.code} · {item.quantity} {item.quantity === 1 ? "pieza" : "piezas"} · pagado el {item.paidAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long" })}
            </p>
          </div>
          <Link href={`/panel/reservas/${item.id}`} className={buttonClass}>
            {action}
          </Link>
        </li>
      ))}
    </ul>
  );
}
