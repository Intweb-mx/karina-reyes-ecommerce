import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { envios } from "@/content/legal/envios";

export const metadata: Metadata = { title: envios.shortTitle };

export default function Page() {
  return <LegalPage doc={envios} />;
}
