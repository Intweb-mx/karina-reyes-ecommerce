import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "inttimo",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f1ec",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="antialiased">
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
