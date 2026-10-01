import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacidad } from "@/content/legal/privacidad";

export const metadata: Metadata = { title: privacidad.shortTitle };

export default function Page() {
  return <LegalPage doc={privacidad} />;
}
