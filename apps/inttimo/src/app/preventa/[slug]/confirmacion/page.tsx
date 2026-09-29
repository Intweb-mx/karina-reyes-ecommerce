import type { Metadata } from "next";
import { ConfirmationStatus } from "@/components/presale/ConfirmationStatus";

export const metadata: Metadata = { title: "Confirmación de preventa", robots: { index: false } };

export default async function ConfirmationPage({ params, searchParams }: PageProps<"/preventa/[slug]/confirmacion">) {
  const { slug } = await params;
  const sessionId = (await searchParams).session_id;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <p className="text-xs tracking-[0.25em] text-muted uppercase">Preventa</p>
      <ConfirmationStatus slug={slug} sessionId={typeof sessionId === "string" ? sessionId : null} />
    </main>
  );
}
