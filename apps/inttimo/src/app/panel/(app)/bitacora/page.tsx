import { listAdminActions } from "@inttimo/database";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { ACTION_LABELS, Card, EmptyState, FIELD_LABELS, PageHeader } from "../../ui";

export const metadata = { title: "Actividad" };

const when = (date: Date) => date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "activado" : "desactivado";
  if (field === "unitAmount" && typeof value === "number") return formatMoney(value, "mxn");
  if (field === "status") return { draft: "oculta", active: "activa", closed: "cerrada" }[String(value)] ?? String(value);
  if ((field === "startsAt" || field === "endsAt") && typeof value === "string") return when(new Date(value));
  return String(value);
}

/** Resume en español los datos guardados de cada acción; lo que no se reconoce no se muestra. */
function detail(action: string, metadata: Record<string, unknown>): string {
  if (action === "campaign.update") {
    return Object.entries(metadata)
      .flatMap(([field, change]) => {
        const label = FIELD_LABELS[field];
        if (!label || !change || typeof change !== "object") return [];
        const { antes, despues } = change as { antes?: unknown; despues?: unknown };
        if (Array.isArray(despues)) return [`${label}: cambiados`];
        return [`${label}: ${show(field, antes)} → ${show(field, despues)}`];
      })
      .join(" · ");
  }
  if (action === "reservations.export" && typeof metadata.rows === "number") return `${metadata.rows} pedidos`;
  if (action === "terms.publish" && metadata.version) return `Versión ${metadata.version}`;
  if (action.startsWith("admin.") && typeof metadata.email === "string") return metadata.email;
  if (action === "reservation.label" && typeof metadata.error === "string") return "No se pudo generar";
  return "";
}

export default async function AuditLogPage() {
  await requireAdmin();
  const entries = (await listAdminActions(getDb(), 300)).filter((e) => e.action !== "reservation.view").slice(0, 200);
  return (
    <div className="space-y-8">
      <PageHeader back={<Link href="/panel/ajustes" className="hover:text-fg">← Ajustes</Link>} title="Actividad" subtitle="Quién hizo qué en el panel. Este registro no se puede editar ni borrar." />
      <Card>
        {entries.length === 0 && <EmptyState title="Todavía no hay actividad." />}
        <ol className="divide-y divide-border">
          {entries.map((e) => {
            const info = detail(e.action, e.metadata);
            return (
              <li key={e.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[11rem_1fr] sm:gap-6">
                <span className="text-xs text-muted sm:pt-0.5 sm:text-sm">{when(e.createdAt)}</span>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{ACTION_LABELS[e.action] ?? "Otra acción"}</span>
                    <span className="text-muted"> · {e.actorEmail === "cli" ? "Soporte técnico" : e.actorEmail}</span>
                  </p>
                  {info && <p className="mt-0.5 break-words text-muted">{info}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
