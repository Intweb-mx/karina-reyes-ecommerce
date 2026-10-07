import { listCampaigns } from "@inttimo/database";
import type { ReactNode } from "react";
import { storeEnabled } from "@/lib/store/flags";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { PanelSidebar } from "./PanelSidebar";

export default async function PanelAppLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const campaigns = (await listCampaigns(getDb())).map((campaign) => ({ slug: campaign.slug, name: campaign.productName }));
  return (
    <>
      <a href="#panel-contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Saltar al contenido
      </a>
      <div className="lg:flex">
        <PanelSidebar campaigns={campaigns} email={admin.email} storeEnabled={storeEnabled} />
        <main id="panel-contenido" className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">{children}</div>
        </main>
      </div>
    </>
  );
}
