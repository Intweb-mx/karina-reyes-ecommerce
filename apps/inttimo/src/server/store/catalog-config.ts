import { z } from "zod";

/** Pesos (como los escribe el negocio, p. ej. 472.14) → centavos enteros. Rechaza más de 2 decimales. */
const pesos = z
  .number()
  .nonnegative("El precio no puede ser negativo.")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "Máximo 2 decimales.")
  .transform((value) => Math.round(value * 100));

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/, "Slug no válido (minúsculas, números y guiones).");

const productSchema = z
  .object({
    slug,
    name: z.string().trim().min(1).max(120),
    sku: z.string().trim().min(1).max(60).nullable().optional(),
    price: pesos.nullable(),
    compareAtPrice: pesos.nullable().optional(),
    saleStatus: z.enum(["coming_soon", "presale", "on_sale"]),
    published: z.boolean(),
    maxQuantityPerOrder: z.number().int().min(1).max(100).optional(),
    /** Paquete: descuenta `units` piezas del inventario de `slug`. */
    bundleOf: z.object({ slug, units: z.number().int().min(2).max(100) }).nullable().optional(),
    /** Fin del envío gratis (ISO con zona horaria). Null u omitido = sin envío gratis. */
    freeShippingUntil: z.iso.datetime({ offset: true }).nullable().optional(),
    /** Fin del descuento (ISO con zona horaria): desde ese momento se cobra `compareAtPrice`. Exige precio tachado. */
    saleEndsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((product) => product.compareAtPrice == null || (product.price !== null && product.compareAtPrice > product.price), {
    message: "El precio anterior (tachado) debe ser mayor que el precio.",
    path: ["compareAtPrice"],
  })
  .refine((product) => !product.saleEndsAt || product.compareAtPrice != null, {
    message: "El fin del descuento necesita el precio normal en compareAtPrice.",
    path: ["saleEndsAt"],
  })
  .refine((product) => product.bundleOf?.slug !== product.slug, { message: "Un paquete no puede descontar de sí mismo.", path: ["bundleOf"] });

export const catalogConfigSchema = z
  .object({ products: z.array(productSchema).min(1) })
  .refine((catalog) => new Set(catalog.products.map((product) => product.slug)).size === catalog.products.length, "Hay slugs repetidos.");

export type CatalogConfig = z.infer<typeof catalogConfigSchema>;
export type CatalogProduct = CatalogConfig["products"][number];

/** Productos base primero: un paquete necesita que su producto base ya exista. */
export function upsertOrder(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) => Number(!!a.bundleOf) - Number(!!b.bundleOf));
}
