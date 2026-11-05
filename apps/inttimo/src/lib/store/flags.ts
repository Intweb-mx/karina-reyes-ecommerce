import { notFound } from "next/navigation";

/**
 * La tienda completa está oculta en producción hasta su aprobación (CLAUDE.md §1).
 * Se ve en desarrollo local o con NEXT_PUBLIC_STORE_ENABLED=1. Los previews de Vercel se construyen con
 * NODE_ENV=production: ahí tampoco se ve sin esa variable (nunca activarla en un Preview con llaves live de Stripe).
 */
export const storeEnabled = process.env.NEXT_PUBLIC_STORE_ENABLED === "1" || process.env.NODE_ENV !== "production";

/** En Server Components: 404 si la tienda no está habilitada. */
export function requireStore() {
  if (!storeEnabled) notFound();
}
