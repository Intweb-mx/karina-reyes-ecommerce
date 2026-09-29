import type { Metadata } from "next";
import { ConfirmationStatus } from "@/components/presale/ConfirmationStatus";

export const metadata: Metadata = { title: "Confirmación de preventa", robots: { index: false } };

export default async function ConfirmationPage({ params, searchParams }: PageProps<"/preventa/[slug]/confirmacion">) {
  const { slug } = await params;
  const sessionId = (await searchParams).session_id;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-8 sm:py-24">
      <ConfirmationStatus slug={slug} sessionId={typeof sessionId === "string" ? sessionId : null} />
    </main>
  );
}
