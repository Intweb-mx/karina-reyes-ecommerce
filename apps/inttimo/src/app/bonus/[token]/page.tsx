import type { Metadata } from "next";
import { connection } from "next/server";
import { PresaleShell } from "@/components/layout/PresaleShell";
import { BonusView } from "@/components/presale/bonus/BonusView";
import { resolveBonusAccess } from "@/server/presale/bonus";
import { getDb } from "@/server/presale/runtime";

export const metadata: Metadata = { title: "Tu bonus de preventa", robots: { index: false, follow: false } };

/** Acceso personal y temporal al bonus digital de preventa (enlace enviado por correo). */
export default async function BonusPage({ params }: PageProps<"/bonus/[token]">) {
  await connection();
  const now = new Date();
  const access = await resolveBonusAccess(getDb(), (await params).token, now);

  return (
    <PresaleShell>
      <main className="container-page section-y">
        <BonusView state={access.status === "ok" ? { ...access, now } : access} />
      </main>
    </PresaleShell>
  );
}
