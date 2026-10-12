/**
 * Política de seguridad de contenido (CSP). Vive aparte de next.config.ts para poder probarla.
 *
 * Los medios (`<video>`) del bonus se sirven con URLs firmadas del almacenamiento privado (otro dominio): sin una
 * entrada en `media-src` el navegador los bloquea y el video no abre, aunque la URL sea válida.
 */
export type CspOptions = {
  isDev: boolean;
  /** STORAGE_ENDPOINT del bucket privado; de ahí sale el único origen externo permitido para video. */
  storageEndpoint?: string;
};

function originOf(endpoint: string | undefined): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ isDev, storageEndpoint }: CspOptions): string {
  const storageOrigin = originOf(storageEndpoint);
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    `media-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
