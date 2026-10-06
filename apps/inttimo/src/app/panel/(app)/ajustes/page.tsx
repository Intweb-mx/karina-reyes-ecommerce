import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";
import { Card, PageHeader, secondaryButtonClass } from "../../ui";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Actividad" description="Quién hizo qué en el panel. No se puede editar ni borrar.">
          <Link href="/panel/bitacora" className={secondaryButtonClass}>
            Ver actividad
          </Link>
        </Card>
        <Card title="Usuarios del panel" description="Por ahora los usuarios se crean y se dan de baja con soporte técnico.">
          <p className="text-sm text-muted">Pronto podrás invitar y quitar usuarios desde aquí.</p>
        </Card>
      </div>
    </div>
  );
}
