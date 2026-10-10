import { getRemainingUnits, listCampaigns } from "@inttimo/database";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card, PageHeader } from "../../../ui";
import { ManualSaleForm, type SaleCampaign } from "./ManualSaleForm";

export const metadata = { title: "Registrar venta" };

const ORDER = { active: 0, closed: 1, draft: 2 } as const;

export default async function NewManualSalePage() {
  await requireAdmin();
  const db = getDb();
  const campaigns = (await listCampaigns(db)).filter((c) => c.status !== "draft").sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const options: SaleCampaign[] = await Promise.all(
    campaigns.map(async (c) => ({ id: c.id, name: c.productName, unitAmount: c.unitAmount, currency: c.currency, remaining: await getRemainingUnits(db, c) })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        back={<Link prefetch={false} href="/panel/pedidos" className="hover:text-fg">← Pedidos</Link>}
        title="Registrar venta"
        subtitle="Ventas en persona pagadas en efectivo o por transferencia. Quedan como un pedido más, con folio e historial."
      />
      <Card>
        <ManualSaleForm campaigns={options} />
      </Card>
    </div>
  );
}
