import { getCampaignBySlug } from "@inttimo/database";
import { notFound, permanentRedirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";

/** Ruta anterior de la lista de pedidos por preventa: ahora es la lista global filtrada. */
export default async function LegacyCampaignPage({ params }: PageProps<"/panel/campanas/[slug]">) {
  await requireAdmin();
  const campaign = await getCampaignBySlug(getDb(), (await params).slug);
  if (!campaign) notFound();
  permanentRedirect(`/panel/pedidos?tab=all&campana=${campaign.id}`);
}
