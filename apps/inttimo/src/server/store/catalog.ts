import { getExpiredHeldUnits, listStoreProducts, type Database, type StoreProductWithInventory } from "@inttimo/database";
import { z } from "zod";
import { getStoreProductContent, type StoreProductContent } from "../../content/store-products.ts";
import type { CartQuoteLine, CartQuoteResponse, CatalogResponse, Money, ProductDetail, ProductStatus, ProductSummary, TerritoryId } from "../../lib/store/contract.ts";
import { fail, ok, zodFieldErrors, type StoreDeps, type StoreResult } from "./common.ts";
import { lineSchema, MAX_CART_LINES, normalizeLines } from "./lines.ts";

/** Producto publicado, con contenido y con su disponible efectivo. */
export type ForSale = StoreProductWithInventory & { content: StoreProductContent; effectiveAvailable: number };

const TERRITORIES: readonly TerritoryId[] = ["conversacion", "conexion", "intimidad", "disfrute", "conocimiento", "fe"];
const isTerritory = (value: string): value is TerritoryId => (TERRITORIES as readonly string[]).includes(value);
const money = (amount: number, currency: string): Money => ({ amount, currency });

/**
 * Productos publicados que tienen contenido, con su disponible efectivo: `existencias − apartado + apartados ya vencidos`.
 * Solo lee (no libera nada): la liberación ocurre en el checkout y en `store:reconcile`.
 */
export async function loadForSale(db: Database, now: Date): Promise<ForSale[]> {
  const products = await listStoreProducts(db, { publishedOnly: true });
  const expired = await getExpiredHeldUnits(db, products.map((product) => product.id), now);
  return products.flatMap((product) => {
    const content = getStoreProductContent(product.slug);
    if (!content) {
      console.warn(JSON.stringify({ level: "warn", msg: "store_product_without_content", slug: product.slug }));
      return [];
    }
    return [{ ...product, content, effectiveAvailable: Math.max(0, product.available + (expired.get(product.id) ?? 0)) }];
  });
}

/** Se puede comprar: tiene precio y ya no es "próximamente" (el stock se revisa aparte). */
export function isPurchasable(product: Pick<ForSale, "price" | "saleStatus">): boolean {
  return product.price !== null && product.saleStatus !== "coming_soon";
}

export function productStatus(product: Pick<ForSale, "saleStatus" | "effectiveAvailable" | "lowStockThreshold">): ProductStatus {
  if (product.saleStatus === "coming_soon") return "coming_soon";
  if (product.saleStatus === "presale") return "presale";
  if (product.effectiveAvailable <= 0) return "sold_out";
  if (product.effectiveAvailable <= product.lowStockThreshold) return "low_stock";
  return "available";
}

export function toSummary(product: ForSale): ProductSummary {
  const status = productStatus(product);
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    tagline: product.content.tagline,
    type: product.type,
    status,
    price: product.price === null ? null : money(product.price, product.currency),
    compareAtPrice: product.compareAtPrice === null ? null : money(product.compareAtPrice, product.currency),
    image: product.content.image,
    territories: product.territories.filter(isTerritory),
    availableUnits: status === "low_stock" ? product.effectiveAvailable : null,
  };
}

const nowOf = (deps: Pick<StoreDeps, "now">) => deps.now?.() ?? new Date();

/** GET /api/tienda/productos */
export async function getCatalog(deps: Pick<StoreDeps, "db" | "now">): Promise<StoreResult<CatalogResponse>> {
  const products = await loadForSale(deps.db, nowOf(deps));
  return ok({ products: products.map(toSummary) });
}

/** GET /api/tienda/productos/[slug] — 404 si no existe, no está publicado o no tiene contenido. */
export async function getProduct(deps: Pick<StoreDeps, "db" | "now">, slug: string): Promise<StoreResult<ProductDetail>> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fail(404, "not_found", "Producto no encontrado.");
  const products = await loadForSale(deps.db, nowOf(deps));
  const product = products.find((candidate) => candidate.slug === slug);
  if (!product) return fail(404, "not_found", "Producto no encontrado.");
  const { content } = product;
  return ok({
    ...toSummary(product),
    description: content.description,
    gallery: content.gallery,
    includes: content.includes,
    howToPlay: content.howToPlay,
    faqs: content.faqs,
    maxQuantityPerOrder: product.maxQuantityPerOrder,
    related: products.filter((candidate) => candidate.id !== product.id).slice(0, 3).map(toSummary),
    seo: content.seo,
  });
}

function stockNotice(available: number): string {
  return available === 1 ? "Solo queda 1 unidad; ajustamos la cantidad." : `Solo quedan ${available} unidades; ajustamos la cantidad.`;
}

/** Precio y cantidad de una línea según la base: ajusta al máximo por pedido y a lo disponible, y lo explica. */
export function quoteLine(product: ForSale, requested: number): CartQuoteLine {
  const base = { productId: product.id, slug: product.slug, name: product.name, image: product.content.image, unitPrice: money(product.price ?? 0, product.currency) };
  if (!isPurchasable(product)) {
    return { ...base, quantity: requested, subtotal: money(0, product.currency), notice: "Este producto todavía no está a la venta.", available: false, maxQuantity: requested };
  }
  if (product.effectiveAvailable <= 0) {
    return { ...base, quantity: requested, subtotal: money(0, product.currency), notice: "Este producto se agotó.", available: false, maxQuantity: requested };
  }
  const maxQuantity = Math.min(product.maxQuantityPerOrder, product.effectiveAvailable);
  const quantity = Math.min(requested, maxQuantity);
  const notice = quantity === requested ? null : product.effectiveAvailable < product.maxQuantityPerOrder ? stockNotice(product.effectiveAvailable) : `Máximo ${product.maxQuantityPerOrder} por pedido.`;
  return { ...base, quantity, subtotal: money(product.price! * quantity, product.currency), notice, available: true, maxQuantity };
}

const quoteSchema = z.object({
  lines: z.array(lineSchema).max(MAX_CART_LINES, "Demasiados productos en el carrito."),
  couponCode: z.string().trim().max(50).optional(),
});

/**
 * POST /api/tienda/carrito/cotizar. Precios, subtotales y total salen de la base. Ids desconocidos u ocultos se omiten
 * (no hay nombre ni imagen que mostrar; el checkout los rechaza). No hay módulo de cupones: cualquier código es inválido.
 */
export async function quoteCart(deps: Pick<StoreDeps, "db" | "now">, body: unknown): Promise<StoreResult<CartQuoteResponse>> {
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", "Revisa tu carrito.", zodFieldErrors(parsed.error));
  const products = await loadForSale(deps.db, nowOf(deps));
  const byId = new Map(products.map((product) => [product.id, product]));

  const lines = normalizeLines(parsed.data.lines).flatMap((line) => {
    const product = byId.get(line.productId);
    return product ? [quoteLine(product, line.quantity)] : [];
  });
  const currency = lines[0]?.unitPrice.currency ?? products[0]?.currency ?? "mxn";
  const subtotal = lines.reduce((sum, line) => sum + (line.available ? line.subtotal.amount : 0), 0);
  return ok({
    lines,
    subtotal: money(subtotal, currency),
    discount: null,
    coupon: null,
    couponError: parsed.data.couponCode ? "Este cupón no es válido." : null,
    total: money(subtotal, currency),
  });
}
