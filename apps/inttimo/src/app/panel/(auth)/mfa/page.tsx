import { redirect } from "next/navigation";
import { getAdminState } from "@/server/auth/admin";
import { signOut } from "../../auth-actions";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "Verificación en dos pasos" };

export default async function MfaPage() {
  const state = await getAdminState();
  if (state.status === "ok") redirect("/panel");
  if (state.status !== "needs_mfa_verify") redirect("/panel/login");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-sand)_0%,transparent_60%)] px-4 py-12">
      <div className="w-full max-w-sm border border-border bg-[#fffdf9] p-7 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-9">
      <p className="font-serif text-2xl font-medium">Verificación en dos pasos</p>
      <p className="mt-2 mb-8 text-sm text-muted">Tu cuenta tiene activada una app autenticadora. Escribe su código de 6 dígitos.</p>
      <MfaForm />
      <form action={signOut} className="mt-6 text-center text-sm">
        <button type="submit" className="text-muted underline underline-offset-4">Salir ({state.admin.email})</button>
      </form>
      </div>
    </main>
  );
}
