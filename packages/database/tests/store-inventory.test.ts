import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../src/client.ts";
import {
  adjustStock,
  getStoreProductById,
  getStoreProductBySlug,
  InvalidStockAdjustmentError,
  listStockMovements,
  listStoreProducts,
  StockBelowReservedError,
  StoreProductNotFoundError,
  upsertStoreProduct,
} from "../src/store.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const slug = () => `producto-${randomUUID().slice(0, 8)}`;

describe("productos", () => {
  it("crea el producto con inventario en cero, sin precio y oculto", async () => {
    const product = await upsertStoreProduct(db, { slug: slug(), name: "UNO+UNO" });
    expect(product).toMatchObject({ price: null, published: false, saleStatus: "coming_soon" });
    expect(await getStoreProductById(db, product.id)).toMatchObject({ onHand: 0, reserved: 0, available: 0 });
  });

  it("actualizar por slug cambia los datos y conserva las existencias", async () => {
    const s = slug();
    const created = await upsertStoreProduct(db, { slug: s, name: "Antes" });
    await adjustStock(db, { productId: created.id, delta: 7, reason: "reception", actor: "test" });
    const updated = await upsertStoreProduct(db, { slug: s, name: "Después", price: 50_000, published: true, saleStatus: "on_sale" });
    expect(updated.id).toBe(created.id);
    expect(await getStoreProductBySlug(db, s)).toMatchObject({ name: "Después", price: 50_000, onHand: 7, available: 7 });
  });

  it("busca por slug y por id; devuelve null si no existe", async () => {
    const created = await upsertStoreProduct(db, { slug: slug(), name: "Existe" });
    expect((await getStoreProductBySlug(db, created.slug))?.id).toBe(created.id);
    expect(await getStoreProductBySlug(db, "no-existe")).toBeNull();
    expect(await getStoreProductById(db, randomUUID())).toBeNull();
  });

  it("lista solo los publicados cuando se pide", async () => {
    const visible = await upsertStoreProduct(db, { slug: slug(), name: "Visible", published: true });
    const hidden = await upsertStoreProduct(db, { slug: slug(), name: "Oculto", published: false });
    const published = (await listStoreProducts(db, { publishedOnly: true })).map((p) => p.id);
    expect(published).toContain(visible.id);
    expect(published).not.toContain(hidden.id);
    expect((await listStoreProducts(db)).map((p) => p.id)).toEqual(expect.arrayContaining([visible.id, hidden.id]));
  });
});

describe("ajuste de existencias", () => {
  it("suma y resta con motivo y deja un movimiento por cada cambio", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Con stock" });
    await adjustStock(db, { productId: id, delta: 10, reason: "reception", actor: "karina@ejemplo.com", note: "Primer lote" });
    const after = await adjustStock(db, { productId: id, delta: -3, reason: "damage", actor: "karina@ejemplo.com" });
    expect(after).toMatchObject({ onHand: 7, reserved: 0 });

    const movements = await listStockMovements(db, id);
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => [m.reason, m.deltaOnHand, m.deltaReserved, m.actor, m.orderNumber]).sort()).toEqual(
      [
        ["damage", -3, 0, "karina@ejemplo.com", null],
        ["reception", 10, 0, "karina@ejemplo.com", null],
      ].sort(),
    );
    expect(movements.find((m) => m.reason === "reception")?.note).toBe("Primer lote");
    expect(movements.map((m) => m.reason)).toEqual(["damage", "reception"]); // más reciente primero
  });

  it("rechaza ajustes sin sentido", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Reglas" });
    await expect(adjustStock(db, { productId: id, delta: 0, reason: "adjustment", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: 1.5, reason: "adjustment", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: -2, reason: "reception", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: -2, reason: "return", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    await expect(adjustStock(db, { productId: id, delta: 2, reason: "damage", actor: "t" })).rejects.toBeInstanceOf(InvalidStockAdjustmentError);
    expect(await listStockMovements(db, id)).toHaveLength(0);
  });

  it("no deja las existencias por debajo de lo apartado", async () => {
    const { id } = await upsertStoreProduct(db, { slug: slug(), name: "Apartado" });
    await adjustStock(db, { productId: id, delta: 7, reason: "reception", actor: "t" });
    await db.execute(sql`update store_inventory set reserved = 4 where product_id = ${id}`);
    await expect(adjustStock(db, { productId: id, delta: -4, reason: "correction", actor: "t" })).rejects.toMatchObject({ name: "StockBelowReservedError", reserved: 4 });
    await expect(adjustStock(db, { productId: id, delta: -4, reason: "correction", actor: "t" })).rejects.toBeInstanceOf(StockBelowReservedError);
    expect(await adjustStock(db, { productId: id, delta: -3, reason: "correction", actor: "t" })).toMatchObject({ onHand: 4, reserved: 4 });
  });

  it("falla con un producto que no existe", async () => {
    await expect(adjustStock(db, { productId: randomUUID(), delta: 1, reason: "reception", actor: "t" })).rejects.toBeInstanceOf(StoreProductNotFoundError);
  });
});
