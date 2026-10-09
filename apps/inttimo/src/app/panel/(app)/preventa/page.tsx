import { getCampaignStats, getRemainingUnits, listCampaigns } from "@inttimo/database";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getPhase } from "@/server/presale/campaign";
import { getDb } from "@/server/presale/runtime";
import { Badge, buttonClass, Card, EmptyState, PageHeader, secondaryButtonClass } from "../../ui";

export const metadata = { title: "Preventa" };

const PHASE = { upcoming: "Por abrir", open: "Abierta", closed: "Cerrada" } as const;
const ORDER = { active: 0, draft: 1, closed: 2 } as const;

export default async function PresalePage() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const campaigns = (await listCampaigns(db)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.startsAt.getTime() - a.startsAt.getTime());
  const rows = await Promise.all(campaigns.map(async (campaign) => ({ campaign, stats: await getCampaignStats(db, campaign.id), remaining: await getRemainingUnits(db, campaign, now) })));

  return (
    <div className="space-y-6">
      <PageHeader title="Preventa" subtitle="Ventas, piezas disponibles y datos de cada preventa." />
      {rows.length === 0 && <EmptyState title="Todavía no hay preventas." />}
      {rows.map(({ campaign, stats, remaining }) => {
        const phase = campaign.status === "draft" ? null : getPhase(campaign, now);
        return (
          <Card
            key={campaign.id}
            title={campaign.productName}
            description={campaign.slug}
            actions={
              <div className="flex flex-wrap gap-2">
                <a href={`/preventa/${campaign.slug}`} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                  Ver página
                </a>
                <a href={`/panel/campanas/${campaign.slug}/export`} className={secondaryButtonClass}>
                  Descargar lista (Excel)
                </a>
                <Link prefetch={false} href={`/panel/campanas/${campaign.slug}/editar`} className={secondaryButtonClass}>
                  Editar
                </Link>
                <Link prefetch={false} href={`/panel/pedidos?tab=all&campana=${campaign.id}`} className={buttonClass}>
                  Ver pedidos
                </Link>
              </div>
            }
          >
            <dl className="grid gap-4 text-sm sm:grid-cols-5">
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
                <dd className="mt-1 tabular-nums">
                  {stats.paidReservations} ({stats.paidUnits} {stats.paidUnits === 1 ? "pieza" : "piezas"})
                </dd>
              </div>
              <div>
                <dt className="text-muted">Disponibles</dt>
                <dd className="mt-1 tabular-nums">{remaining === null ? "Sin límite" : `Quedan ${remaining} de ${campaign.totalUnits}`}</dd>
              </div>
              <div>
                <dt className="text-muted">Ventas (sin reembolsos)</dt>
                <dd className="mt-1 tabular-nums">{formatMoney(stats.netRevenue, campaign.currency)}</dd>
              </div>
            </dl>
          </Card>
        );
      })}
    </div>
  );
}
