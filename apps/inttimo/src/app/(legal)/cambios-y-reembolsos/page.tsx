import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { cambios } from "@/content/legal/cambios";

export const metadata: Metadata = { title: cambios.shortTitle };

export default function Page() {
  return <LegalPage doc={cambios} />;
}
