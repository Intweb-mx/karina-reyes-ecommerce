import { notFound } from "next/navigation";
import { AdminLeads } from "@/components/store/admin/AdminLeads";

export const metadata = { title: "Solicitudes" };

export default function StoreAdminLeadsPage() {
  // Contacto e iglesias aún no tienen backend (docs/store/BACKEND-PLAN.md, subproyecto 7): solo existe en el simulador.
  if (process.env.NEXT_PUBLIC_STORE_API === "http") notFound();
  return <AdminLeads />;
}
