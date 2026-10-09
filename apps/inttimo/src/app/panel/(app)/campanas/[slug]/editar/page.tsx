import { getCampaignBySlug, getCurrentTerms, listReservations, listTermsVersions } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card, PageHeader, secondaryButtonClass } from "../../../../ui";
import { saveCampaign, saveTerms } from "./actions";
import { CampaignForm, TermsForm } from "./forms";

export const metadata = { title: "Editar preventa" };

/** Fecha en hora de CDMX (UTC-6 fijo) para <input type="datetime-local">. */
function toLocalInput(date: Date): string {
  return new Date(date.getTime() - 6 * 3_600_000).toISOString().slice(0, 16);
}

export default async function EditCampaignPage({ params }: PageProps<"/panel/campanas/[slug]/editar">) {
  await requireAdmin();
  const { slug } = await params;
  const db = getDb();
  const campaign = await getCampaignBySlug(db, slug);
  if (!campaign) notFound();
  const [terms, versions, reservations] = await Promise.all([getCurrentTerms(db, campaign.id), listTermsVersions(db, campaign.id), listReservations(db, campaign.id)]);

  return (
    <div className="space-y-8">
      <PageHeader
        back={<Link prefetch={false} href="/panel/preventa" className="hover:text-fg">← Preventa</Link>}
        title="Editar preventa"
        subtitle={`${reservations.length} ${reservations.length === 1 ? "pedido" : "pedidos"} hasta ahora. Los cambios se ven en la página al guardar.`}
        actions={
          <a href={`/preventa/${slug}`} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
            Ver la página ↗
          </a>
        }
      />

      <Card title="Datos de la preventa">
        <CampaignForm
          action={saveCampaign.bind(null, slug)}
          hasReservations={reservations.length > 0}
          defaults={{
            productName: campaign.productName,
            status: campaign.status,
            startsAt: toLocalInput(campaign.startsAt),
            endsAt: toLocalInput(campaign.endsAt),
            price: (campaign.unitAmount / 100).toFixed(2),
            currency: campaign.currency.toUpperCase(),
            maxQuantityPerReservation: campaign.maxQuantityPerReservation,
            pickupEnabled: campaign.pickupEnabled,
            shippingEnabled: campaign.shippingEnabled,
            pickupPoints: campaign.pickupPoints,
            shippingConfigured: campaign.shippingProfile !== null,
            deliveryNote: campaign.deliveryNote ?? "",
            questions: JSON.stringify(campaign.questions),
          }}
        />
      </Card>

      <Card title={terms ? `Términos de la preventa · versión ${terms.version} vigente` : "Términos de la preventa · sin publicar"}>
        <TermsForm action={saveTerms.bind(null, slug)} defaultContent={terms?.content ?? ""} />
        {versions.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted">
            {versions.map((v) => (
              <li key={v.id}>
                Versión {v.version} · {v.createdBy === "cli" ? "Soporte técnico" : v.createdBy} · {v.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
