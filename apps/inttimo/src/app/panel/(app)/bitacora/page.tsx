import { listAdminActions } from "@inttimo/database";
import { formatMoney } from "@/lib/format";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { ACTION_LABELS, Card, FIELD_LABELS } from "../../ui";

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
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Actividad</h1>
      <p className="text-sm text-muted">Quién hizo qué en el panel. Este registro no se puede editar ni borrar.</p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">Fecha</th>
                <th className="py-2 pr-4 font-normal">Quién</th>
                <th className="py-2 pr-4 font-normal">Qué hizo</th>
                <th className="py-2 font-normal">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">{when(e.createdAt)}</td>
                  <td className="py-2 pr-4">{e.actorEmail === "cli" ? "Soporte técnico" : e.actorEmail}</td>
                  <td className="py-2 pr-4">{ACTION_LABELS[e.action] ?? "Otra acción"}</td>
                  <td className="py-2 text-muted">{detail(e.action, e.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
