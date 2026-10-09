import Link from "next/link";
import { INCIDENT_LABELS, type OrderSummary } from "@/server/admin/contract";
import { getInbox } from "@/server/admin/inbox";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { WelcomeTip } from "./WelcomeTip";
import { Badge, Card, daysSince, EmptyState, PageHeader, Stat } from "../ui";

export const metadata = { title: "Hoy" };

type Row = OrderSummary & { key: string; badge?: string };

export default async function InboxPage() {
  await requireAdmin();
  const now = new Date();
  const inbox = await getInbox(getDb(), now);
  const greeting = now.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" });
  const rows = (items: OrderSummary[]): Row[] => items.map((o) => ({ ...o, key: o.id }));

  return (
    <div className="space-y-10">
      <PageHeader title="Hoy" subtitle={<span className="first-letter:uppercase">{greeting} · Lo que hay que atender, del pedido más antiguo al más reciente.</span>} />
      <WelcomeTip />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Generar guía" value={inbox.toLabel.length} tone={inbox.toLabel.length ? "attention" : "good"} />
        <Stat label="Entregar a la paquetería" value={inbox.toHandOver.length} tone={inbox.toHandOver.length ? "attention" : "good"} />
        <Stat label="Avisar que está listo" value={inbox.toNotify.length} tone={inbox.toNotify.length ? "attention" : "good"} />
        <Stat label="Problemas" value={inbox.incidents.length} tone={inbox.incidents.length ? "attention" : "good"} />
      </div>

      {inbox.incidents.length > 0 && (
        <Card title={`Problemas por resolver · ${inbox.incidents.length}`} description="Algo falló o lleva demasiado tiempo. Abre el pedido para resolverlo.">
          <InboxList rows={inbox.incidents.map((o) => ({ ...o, key: `${o.id}-${o.incident}`, badge: INCIDENT_LABELS[o.incident] }))} action="Revisar" empty="" now={now} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Generar guía · ${inbox.toLabel.length}`} description="Pedidos con envío ya pagados. Genera la guía; al cliente todavía no le llega nada.">
          <InboxList rows={rows(inbox.toLabel)} action="Generar guía" empty="No hay guías por generar." now={now} />
        </Card>
        <Card title={`Entregar a la paquetería · ${inbox.toHandOver.length}`} description="La guía ya está lista. Imprímela y, al entregar el paquete, márcalo: ahí se avisa al cliente.">
          <InboxList rows={rows(inbox.toHandOver)} action="Imprimir o marcar" empty="No hay paquetes por entregar." now={now} />
        </Card>
        <Card title={`Avisar que está listo · ${inbox.toNotify.length}`} description="Pedidos para recoger. Cuando estén listos, avisa al cliente.">
          <InboxList rows={rows(inbox.toNotify)} action="Avisar" empty="No hay pedidos por preparar para recolección." now={now} />
        </Card>
        <Card title={`Esperando que lo recojan · ${inbox.awaitingPickup.length}`} description="El cliente ya fue avisado. Marca cuando lo recoja.">
          <InboxList
            rows={inbox.awaitingPickup.map((o) => ({ ...o, key: o.id, badge: o.waitingDays >= 3 ? `${o.waitingDays} días desde el aviso` : undefined }))}
            action="Marcar recogido"
            empty="Nadie tiene pedidos pendientes de recoger."
            now={now}
            ownBadgeOnly
          />
        </Card>
      </div>
    </div>
  );
}

function InboxList({ rows, action, empty, now, ownBadgeOnly = false }: { rows: Row[]; action: string; empty: string; now: Date; ownBadgeOnly?: boolean }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <ul className="-my-2 divide-y divide-border">
      {rows.map((row) => {
        const paidAt = row.paidAt ?? row.createdAt;
        const waiting = daysSince(paidAt, now);
        return (
          <li key={row.key}>
            <Link href={`/panel/pedidos/${row.id}`} className="group -mx-2 flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm transition-colors hover:bg-surface">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {row.fullName}
                  {row.badge ? <Badge tone="attention">{row.badge}</Badge> : !ownBadgeOnly && waiting >= 3 && <Badge tone="attention">{waiting} días esperando</Badge>}
                </p>
                <p className="mt-0.5 text-muted">
                  <span className="font-mono">{row.code}</span> · {row.quantity} {row.quantity === 1 ? "pieza" : "piezas"} · {row.campaignName} · pagado el{" "}
                  {paidAt.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long" })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-bronze group-hover:underline group-hover:underline-offset-4">{action} →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
