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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <p className="font-serif text-2xl">inttimo · panel</p>
      <p className="mt-1 mb-8 text-sm text-muted">Acceso solo para administradores.</p>
      <LoginForm forbidden={forbidden} />
    </main>
  );
}
