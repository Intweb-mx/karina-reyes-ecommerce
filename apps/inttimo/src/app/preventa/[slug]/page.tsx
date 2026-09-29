import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PresaleView } from "@/components/presale/PresaleView";
import { getPublicCampaign } from "@/server/presale/reservations";
import { getDb } from "@/server/presale/runtime";

async function loadCampaign(slug: string) {
  await connection();
  const result = await getPublicCampaign({ db: getDb() }, slug);
  if (!result.ok) notFound();
  return result.data;
}

export async function generateMetadata({ params }: PageProps<"/preventa/[slug]">): Promise<Metadata> {
  const campaign = await loadCampaign((await params).slug);
  return { title: `Preventa ${campaign.productName}` };
}

export default async function PresalePage({ params, searchParams }: PageProps<"/preventa/[slug]">) {
  const campaign = await loadCampaign((await params).slug);
  const canceled = (await searchParams).cancelado === "1";
  return <PresaleView campaign={campaign} canceled={canceled} />;
}
