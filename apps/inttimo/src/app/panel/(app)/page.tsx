import { getCampaignStats, getCurrentTerms, listCampaigns } from "@inttimo/database";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getPhase } from "@/server/presale/campaign";
import { getDb } from "@/server/presale/runtime";
import { Card } from "../ui";

export const metadata = { title: "Campañas" };

const PHASE = { upcoming: "Por abrir", open: "Abierta", closed: "Cerrada" } as const;

export default async function PanelHome() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const campaigns = await Promise.all(
    (await listCampaigns(db)).map(async (campaign) => ({
      campaign,
      stats: await getCampaignStats(db, campaign.id),
      terms: await getCurrentTerms(db, campaign.id),
    })),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Campañas de preventa</h1>
      {campaigns.length === 0 && (
        <Card>
          <p className="text-sm text-muted">Aún no hay campañas. Créala con <code>pnpm presale:upsert --file=…</code> (ver docs/preventa/README.md).</p>
        </Card>
      )}
      {campaigns.map(({ campaign, stats, terms }) => (
        <Card
          key={campaign.id}
          title={campaign.productName}
          actions={
            <Link href={`/panel/campanas/${campaign.slug}`} className="text-sm underline underline-offset-4">
              Ver reservas →
            </Link>
          }
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-muted">Estado</dt>
              <dd>{campaign.status === "draft" ? "Borrador" : PHASE[getPhase(campaign, now)]}</dd>
            </div>
            <div>
              <dt className="text-muted">Cierra</dt>
              <dd>{formatDate(campaign.endsAt.toISOString())}</dd>
            </div>
            <div>
              <dt className="text-muted">Reservas pagadas</dt>
              <dd className="tabular-nums">{stats.paidReservations} ({stats.paidUnits} piezas)</dd>
            </div>
            <div>
              <dt className="text-muted">Ingreso neto</dt>
              <dd className="tabular-nums">{formatMoney(stats.netRevenue, campaign.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted">Términos</dt>
              <dd>{terms ? `Versión ${terms.version}` : <span className="text-danger">Sin publicar</span>}</dd>
            </div>
          </dl>
        </Card>
      ))}
    </div>
  );
}
