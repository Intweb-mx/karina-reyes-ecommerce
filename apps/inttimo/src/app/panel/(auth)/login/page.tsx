import { redirect } from "next/navigation";
import { getAdminState } from "@/server/auth/admin";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/panel/login">) {
  const state = await getAdminState();
  if (state.status === "ok") redirect("/panel");
  if (state.status === "needs_mfa_enroll" || state.status === "needs_mfa_verify") redirect("/panel/mfa");
  const forbidden = (await searchParams).error === "forbidden" || state.status === "forbidden";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-sand)_0%,transparent_60%)] px-4 py-12">
      <div className="w-full max-w-sm border border-border bg-[#fffdf9] p-7 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-9">
      <p className="font-serif text-3xl font-medium">inttimo</p>
      <p className="mt-1 text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Administración</p>
      <p className="mt-6 mb-6 text-sm text-muted">Acceso solo para administradores.</p>
      <LoginForm forbidden={forbidden} />
      </div>
    </main>
  );
}
