import { getFeaturedCampaign } from "@inttimo/database";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PresaleShell } from "@/components/layout/PresaleShell";
import { StateMessage } from "@/components/presale/sections/StateMessage";
import { getDb } from "@/server/presale/runtime";

// Mientras la tienda completa no exista (CLAUDE.md §1), la raíz solo lleva a la preventa.
export default async function HomePage() {
  await connection();
  const campaign = await getFeaturedCampaign(getDb());
  if (campaign) redirect(`/preventa/${campaign.slug}`);

  return (
    <PresaleShell>
      <main className="container-page flex flex-1 flex-col justify-center py-24">
        <StateMessage as="h1" eyebrow="inttimo" title="Muy pronto." body="Estamos preparando algo especial. Vuelve en unos días." />
      </main>
    </PresaleShell>
  );
}
