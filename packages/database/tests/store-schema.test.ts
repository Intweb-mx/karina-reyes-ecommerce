import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { createTestDatabase } from "../src/testing.ts";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});

afterAll(() => close());

const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows;

let counter = 0;

async function product(): Promise<string> {
  counter += 1;
  const result = await db.execute(sql`insert into store_products (slug, name) values (${`producto-${counter}`}, 'Producto') returning id`);
  return rowsOf<{ id: string }>(result)[0]!.id;
}

async function order(overrides: { total?: number; shipping?: number; method?: string; refunded?: number } = {}): Promise<string> {
  counter += 1;
  const { total = 1100, shipping = 100, method = "shipping", refunded = 0 } = overrides;
  const result = await db.execute(sql`
    insert into store_orders (order_number, full_name, email, delivery_method, subtotal_amount, shipping_amount, total_amount, amount_refunded, currency, terms_version, terms_accepted_at)
    values (${`INT-TEST${counter}`}, 'Ana', 'ana@ejemplo.com', ${method}::store_delivery_method, 1000, ${shipping}, ${total}, ${refunded}, 'mxn', 1, now())
    returning id`);
  return rowsOf<{ id: string }>(result)[0]!.id;
}

describe("productos", () => {
  it("nacen ocultos, sin precio y como próximamente", async () => {
    const id = await product();
    const result = await db.execute(sql`select published, price, sale_status, max_quantity_per_order from store_products where id = ${id}`);
    expect(rowsOf(result)[0]).toEqual({ published: false, price: null, sale_status: "coming_soon", max_quantity_per_order: 10 });
  });

  it("rechaza precios negativos y máximos fuera de rango", async () => {
    await expect(db.execute(sql`insert into store_products (slug, name, price) values ('negativo', 'X', -1)`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_products (slug, name, max_quantity_per_order) values ('sin-maximo', 'X', 0)`)).rejects.toThrow();
  });
});

describe("inventario", () => {
  it("las existencias nunca bajan de lo apartado y lo apartado nunca es negativo", async () => {
    const id = await product();
    await expect(db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, 6)`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, -1)`)).rejects.toThrow();
    await db.execute(sql`insert into store_inventory (product_id, on_hand, reserved) values (${id}, 5, 5)`);
    await expect(db.execute(sql`update store_inventory set on_hand = 4 where product_id = ${id}`)).rejects.toThrow();
  });
});

describe("pedidos", () => {
  it("el total tiene que ser subtotal − descuento + envío", async () => {
    await expect(order({ total: 1200 })).rejects.toThrow();
    await expect(order()).resolves.toBeTypeOf("string");
  });

  it("solo los pedidos con envío pueden cobrar envío", async () => {
    await expect(order({ method: "pickup", shipping: 100, total: 1100 })).rejects.toThrow();
    await expect(order({ method: "pickup", shipping: 0, total: 1000 })).resolves.toBeTypeOf("string");
  });

  it("lo reembolsado no puede superar el total", async () => {
    await expect(order({ refunded: 1101 })).rejects.toThrow();
  });
});

describe("historiales", () => {
  it("movimientos, eventos y notas no se editan ni se borran", async () => {
    const productId = await product();
    const orderId = await order();
    await db.execute(sql`insert into store_stock_movements (product_id, delta_on_hand, reason) values (${productId}, 3, 'reception')`);
    await db.execute(sql`insert into store_order_events (order_id, type, source) values (${orderId}, 'ORDER_CREATED', 'api')`);
    await db.execute(sql`insert into store_order_notes (order_id, body, author_email) values (${orderId}, 'Nota', 'karina@ejemplo.com')`);
    for (const table of ["store_stock_movements", "store_order_events", "store_order_notes"]) {
      await expect(db.execute(sql.raw(`update ${table} set created_at = now()`))).rejects.toThrow();
      await expect(db.execute(sql.raw(`delete from ${table}`))).rejects.toThrow();
    }
  });

  it("un movimiento sin cambios y una nota vacía se rechazan", async () => {
    const productId = await product();
    const orderId = await order();
    await expect(db.execute(sql`insert into store_stock_movements (product_id, reason) values (${productId}, 'adjustment')`)).rejects.toThrow();
    await expect(db.execute(sql`insert into store_order_notes (order_id, body, author_email) values (${orderId}, '', 'karina@ejemplo.com')`)).rejects.toThrow();
  });
});
