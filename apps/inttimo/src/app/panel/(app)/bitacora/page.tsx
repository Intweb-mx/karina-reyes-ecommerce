import { listAdminActions } from "@inttimo/database";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card } from "../../ui";

export const metadata = { title: "Bitácora" };

export default async function AuditLogPage() {
  await requireAdmin();
  const entries = await listAdminActions(getDb(), 200);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Bitácora</h1>
      <p className="text-sm text-muted">Cambios de campaña, términos, exportaciones, consultas de reservas y accesos. No se puede editar ni borrar.</p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">Fecha</th>
                <th className="py-2 pr-4 font-normal">Quién</th>
                <th className="py-2 pr-4 font-normal">Acción</th>
                <th className="py-2 font-normal">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">{e.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                  <td className="py-2 pr-4">{e.actorEmail}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{e.action}</td>
                  <td className="py-2 font-mono text-xs break-all text-muted">{Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
