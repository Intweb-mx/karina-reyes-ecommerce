import { z } from "zod";
import type { CartLine } from "../../lib/store/contract.ts";

export const lineSchema = z.object({
  productId: z.string({ error: "Producto no válido." }).trim().min(1, "Producto no válido.").max(64, "Producto no válido."),
  quantity: z.number({ error: "Cantidad no válida." }).int("Cantidad no válida.").min(1, "Cantidad no válida.").max(1000, "Cantidad no válida."),
});

export const MAX_CART_LINES = 50;

/** Carrito para cotizar envío o pagar: al menos un producto. */
export const cartLinesSchema = z.array(lineSchema).min(1, "Tu carrito está vacío.").max(MAX_CART_LINES, "Demasiados productos en el carrito.");

/** Une líneas del mismo producto (id en minúsculas) y las ordena: así se comparan carrito, cotización y checkout. */
export function normalizeLines(lines: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const productId = line.productId.trim().toLowerCase();
    merged.set(productId, (merged.get(productId) ?? 0) + line.quantity);
  }
  return [...merged]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

export function sameLines(a: CartLine[], b: CartLine[]): boolean {
  const left = normalizeLines(a);
  const right = normalizeLines(b);
  return left.length === right.length && left.every((line, index) => line.productId === right[index]!.productId && line.quantity === right[index]!.quantity);
}
