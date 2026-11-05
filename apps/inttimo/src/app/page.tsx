import { getFeaturedCampaign } from "@inttimo/database";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PresaleShell } from "@/components/layout/PresaleShell";
import { StateMessage } from "@/components/presale/sections/StateMessage";
import { PageTransition } from "@/components/store/layout/PageTransition";
import { StoreShell } from "@/components/store/layout/StoreShell";
import { StoreHome } from "@/components/store/pages/StoreHome";
import { sitePublic } from "@/lib/store/flags";
import { getDb } from "@/server/presale/runtime";

// Con el sitio habilitado (desarrollo, NEXT_PUBLIC_SITE_PUBLIC=1 o NEXT_PUBLIC_STORE_ENABLED=1) la raíz es el home de inttimo.
// En producción, mientras no se habilite (CLAUDE.md §1), la raíz sigue llevando a la preventa.
export default async function HomePage() {
  if (sitePublic) {
    return (
      <StoreShell>
        <PageTransition>
          <StoreHome />
        </PageTransition>
      </StoreShell>
    );
  }

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
