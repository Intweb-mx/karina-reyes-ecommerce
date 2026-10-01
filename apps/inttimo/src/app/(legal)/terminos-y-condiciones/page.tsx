import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { terminos } from "@/content/legal/terminos";

export const metadata: Metadata = { title: terminos.shortTitle };

export default function Page() {
  return <LegalPage doc={terminos} />;
}
