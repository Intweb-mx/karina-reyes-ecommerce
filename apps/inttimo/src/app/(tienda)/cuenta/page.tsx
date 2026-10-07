import type { Metadata } from "next";
import { AccountClient } from "@/components/store/account/AccountClient";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };

export default function CuentaPage() {
  return (
    <main className="container-page section-y">
      <AccountClient />
    </main>
  );
}
