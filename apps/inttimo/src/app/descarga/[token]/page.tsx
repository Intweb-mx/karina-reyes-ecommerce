import type { Metadata } from "next";
import { connection } from "next/server";
import { PresaleShell } from "@/components/layout/PresaleShell";
import { DownloadView } from "@/components/store/download/DownloadView";
import { getDb } from "@/server/presale/runtime";
import { downloadState } from "@/server/store/downloads";

export const metadata: Metadata = { title: "Tu descarga", robots: { index: false, follow: false } };

/** Enlace de descarga de un producto digital (un solo uso). Abrir la página no gasta el enlace. */
export default async function DownloadPage({ params }: PageProps<"/descarga/[token]">) {
  await connection();
  const { token } = await params;
  const state = await downloadState(getDb(), token);
  return (
    <PresaleShell>
      <main className="container-page section-y">
        <DownloadView state={state} token={token} />
      </main>
    </PresaleShell>
  );
}
