import { getCampaignBySlug, getCurrentTerms, listReservations, listTermsVersions } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card } from "../../../../ui";
import { saveCampaign, saveTerms } from "./actions";
import { CampaignForm, TermsForm } from "./forms";

export const metadata = { title: "Editar campaña" };

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
    <div className="space-y-6">
      <div>
        <Link href={`/panel/campanas/${slug}`} className="text-sm text-muted">← {campaign.productName}</Link>
        <h1 className="mt-1 font-serif text-3xl">Editar campaña</h1>
        <p className="mt-1 text-sm text-muted">
          Dirección pública: <code>/preventa/{slug}</code> · {reservations.length} reservas
        </p>
      </div>

      <Card title="Campaña">
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
            pickupPoints: JSON.stringify(campaign.pickupPoints, null, 2),
            shippingConfigured: campaign.shippingProfile !== null,
            deliveryNote: campaign.deliveryNote ?? "",
            questions: JSON.stringify(campaign.questions, null, 2),
          }}
        />
      </Card>

      <Card title={terms ? `Términos de la preventa · versión ${terms.version} vigente` : "Términos de la preventa · sin publicar"}>
        <TermsForm action={saveTerms.bind(null, slug)} defaultContent={terms?.content ?? ""} />
        {versions.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted">
            {versions.map((v) => (
              <li key={v.id}>
                Versión {v.version} · {v.createdBy} · {v.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
