import { notFound } from "next/navigation";

/**
 * La tienda completa (carrito, checkout, cuenta, rastreo) está oculta en producción hasta su aprobación (CLAUDE.md §1).
 * Se ve en desarrollo o en producción con NEXT_PUBLIC_STORE_ENABLED=1. Los Previews de Vercel NO la muestran.
 */
export const storeEnabled = process.env.NEXT_PUBLIC_STORE_ENABLED === "1" || process.env.NODE_ENV !== "production";

/**
 * Páginas informativas abiertas al público sin vender (home, para matrimonios, filosofía, iglesias, ayuda, productos,
 * contacto): NEXT_PUBLIC_SITE_PUBLIC=1. Con la tienda habilitada también están abiertas. Carrito, checkout, cuenta,
 * rastreo y confirmación siguen cerrados mientras `storeEnabled` sea falso.
 */
export const sitePublic = storeEnabled || process.env.NEXT_PUBLIC_SITE_PUBLIC === "1";

/**
 * Rastreo, cuenta, formularios de contacto e iglesias, newsletter y panel de la tienda: su backend aún no existe, así que
 * solo funcionan con el simulador. Con NEXT_PUBLIC_STORE_API=http se ofrecen los canales reales (WhatsApp y correo).
 * Quitar cada uno de esta bandera conforme tenga endpoints reales (docs/store/BACKEND-PLAN.md).
 */
export const pendingBackendEnabled = storeEnabled && process.env.NEXT_PUBLIC_STORE_API !== "http";

/** En Server Components: 404 si ni la tienda ni el sitio informativo están habilitados. */
export function requireSite() {
  if (!sitePublic) notFound();
}

/** En Server Components: 404 si la tienda no está habilitada. */
export function requireStore() {
  if (!storeEnabled) notFound();
}
