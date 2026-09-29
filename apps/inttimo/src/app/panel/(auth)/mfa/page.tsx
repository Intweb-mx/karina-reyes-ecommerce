import { redirect } from "next/navigation";
import { getAdminState } from "@/server/auth/admin";
import { signOut } from "../../auth-actions";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "Verificación en dos pasos" };

export default async function MfaPage() {
  const state = await getAdminState();
  if (state.status === "ok") redirect("/panel");
  if (state.status !== "needs_mfa_enroll" && state.status !== "needs_mfa_verify") redirect("/panel/login");
  const enrolling = state.status === "needs_mfa_enroll";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <p className="font-serif text-2xl">Verificación en dos pasos</p>
      <p className="mt-2 mb-8 text-sm text-muted">
        {enrolling
          ? "Obligatoria para el panel. Escanea el código con una app autenticadora (Google Authenticator, 1Password, Authy) y escribe el código de 6 dígitos."
          : "Escribe el código de 6 dígitos de tu app autenticadora."}
      </p>
      <MfaForm enrolling={enrolling} />
      <form action={signOut} className="mt-6 text-center text-sm">
        <button type="submit" className="text-muted underline underline-offset-4">Salir ({state.admin.email})</button>
      </form>
    </main>
  );
}
