/**
 * Crea o actualiza productos de la tienda desde un JSON (por slug): nombre, precio, precio tachado, fin del descuento,
 * estado, publicación, paquetes y envío gratis. NO toca existencias (para eso `pnpm store:stock`) ni peso, medidas o territorios.
 *
 *   pnpm store:catalog --file=docs/store/catalogo.json --dry-run          # solo valida y muestra los cambios
 *   pnpm store:catalog --file=docs/store/catalogo.json                    # base local
 *   pnpm store:catalog --file=docs/store/catalogo.json --allow-remote     # producción (DATABASE_URL exportada)
 *
 * Precios en pesos en el JSON; en la base se guardan en centavos. Stripe no necesita nada: cobra lo que diga la base.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase, getStoreProductBySlug, logAdminAction, upsertStoreProduct } from "@inttimo/database";
import { getStoreProductContent } from "../src/content/store-products.ts";
import { formatMoney } from "../src/lib/format.ts";
import { catalogConfigSchema, upsertOrder } from "../src/server/store/catalog-config.ts";
import { arg, fail, flag, storeDatabaseUrl } from "./cli.ts";

const file = arg("file") ?? fail("Falta --file=ruta/al/archivo.json");
const raw = JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8"));
const parsed = catalogConfigSchema.safeParse(raw);
if (!parsed.success) fail(`Catálogo no válido:\n${parsed.error.issues.map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n")}`);
const products = upsertOrder(parsed.data.products);

const money = (cents: number | null | undefined) => (cents == null ? "—" : formatMoney(cents, "mxn"));
for (const product of products) {
  const parts = [
    `${product.slug} · ${product.name}`,
    `precio ${money(product.price)}${product.compareAtPrice ? ` (antes ${money(product.compareAtPrice)})` : ""}`,
    product.saleStatus,
    product.published ? "publicado" : "oculto",
    product.bundleOf ? `paquete: ${product.bundleOf.units} × ${product.bundleOf.slug}` : null,
    product.saleEndsAt ? `descuento hasta ${product.saleEndsAt} (después ${money(product.compareAtPrice)})` : null,
    product.freeShippingUntil ? `envío gratis ${product.freeShippingFrom ? `del ${product.freeShippingFrom} ` : ""}hasta ${product.freeShippingUntil}` : null,
  ];
  console.log(`  ${parts.filter(Boolean).join(" · ")}`);
  if (product.published && !getStoreProductContent(product.slug)) console.warn(`    ⚠ ${product.slug} no tiene texto en src/content/store-products.ts: no aparecerá en la tienda.`);
}
if (flag("dry-run")) {
  console.log("Válido (sin guardar).");
  process.exit(0);
}

const db = createDatabase(storeDatabaseUrl());
for (const product of products) {
  const base = product.bundleOf ? await getStoreProductBySlug(db, product.bundleOf.slug) : null;
  if (product.bundleOf && !base) fail(`${product.slug}: el producto base ${product.bundleOf.slug} no existe.`);
  const before = await getStoreProductBySlug(db, product.slug);
  const saved = await upsertStoreProduct(db, {
    slug: product.slug,
    name: product.name,
    ...(product.sku !== undefined ? { sku: product.sku } : {}),
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    saleStatus: product.saleStatus,
    published: product.published,
    ...(product.maxQuantityPerOrder ? { maxQuantityPerOrder: product.maxQuantityPerOrder } : {}),
    stockProductId: base?.id ?? null,
    stockUnits: product.bundleOf?.units ?? 1,
    freeShippingFrom: product.freeShippingFrom ? new Date(product.freeShippingFrom) : null,
    freeShippingUntil: product.freeShippingUntil ? new Date(product.freeShippingUntil) : null,
    saleEndsAt: product.saleEndsAt ? new Date(product.saleEndsAt) : null,
  });
  await logAdminAction(db, {
    actorId: null,
    actorEmail: "cli",
    action: before ? "store_product.update" : "store_product.create",
    targetType: "store_product",
    targetId: saved.id,
    metadata: { slug: saved.slug, price: saved.price, compareAtPrice: saved.compareAtPrice, saleEndsAt: saved.saleEndsAt, saleStatus: saved.saleStatus, published: saved.published, before: before ? { price: before.price, compareAtPrice: before.compareAtPrice } : null },
  });
  console.log(`  ${saved.slug}: ${before ? "actualizado" : "creado"}.`);
}
process.exit(0);
