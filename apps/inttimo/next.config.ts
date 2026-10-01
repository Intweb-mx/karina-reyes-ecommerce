import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// El .env vive en la raíz del monorepo (lo comparten la app y los scripts). En Vercel no existe: usa sus variables.
// forceReload: Next ya cargó (y cacheó) el .env de apps/inttimo antes de leer esta config.
loadEnvConfig(resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", undefined, true);

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP base sin nonce. Ampliar connect-src / script-src / frame-src cuando se
 * integren CMS, analítica, Mercado Pago o video aprobados (ver CLAUDE.md).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
  transpilePackages: ["@inttimo/database", "@inttimo/shared-utils", "@inttimo/storage"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/panel/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] },
      // Enlaces personales con token en la URL: sin indexar, sin caché y sin filtrar el token por Referer.
      {
        source: "/bonus/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
