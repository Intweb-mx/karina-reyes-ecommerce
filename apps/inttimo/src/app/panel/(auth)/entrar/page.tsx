import { redirect } from "next/navigation";
import { getAdminState } from "@/server/auth/admin";
import { LinkSignIn } from "./LinkSignIn";

export const metadata = { title: "Entrar" };

/** Destino del botón del correo de acceso. El token viaja en el fragmento (#) y solo lo lee el navegador. */
export default async function EnterPage() {
  const state = await getAdminState();
  if (state.status === "ok") redirect("/panel");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-sand)_0%,transparent_60%)] px-4 py-12">
      <div className="w-full max-w-sm border border-border bg-[#fffdf9] p-7 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-9">
      <p className="font-serif text-3xl font-medium">inttimo</p>
      <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Administración</p>
      <div className="mt-8">
        <LinkSignIn />
      </div>
      </div>
    </main>
  );
}
