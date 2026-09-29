import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel inttimo" },
  robots: { index: false, follow: false },
};

export default function PanelRootLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg text-fg">{children}</div>;
}
