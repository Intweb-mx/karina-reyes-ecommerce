import { addOrderNote, createManualSale, getCampaignById, InsufficientStockError } from "@inttimo/database";
import { z } from "zod";
import { fulfillReservation, type BonusOutcome, type FulfillmentDeps, type Outcome } from "./fulfillment.ts";
import { sendConfirmationIfNeeded } from "./notifications.ts";

/** Importe en pesos como lo escribe Karina ("500", "450.50", "1,000") → centavos. */
const pesos = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Escribe el importe en pesos, por ejemplo 500 o 450.50."))
  .transform((value) => Math.round(Number(value) * 100));

export const manualSaleSchema = z.object({
  campaignId: z.uuid("Elige la preventa."),
  fullName: z.string().trim().min(2, "Escribe el nombre del cliente.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.union([z.literal(""), z.email("Correo no válido.")])),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value || null),
  quantity: z.coerce.number({ error: "Cantidad no válida." }).int("Cantidad no válida.").min(1, "Mínimo 1 pieza.").max(50, "Máximo 50 piezas por venta."),
  amount: pesos,
  paymentMethod: z.enum(["cash", "transfer"], { error: "Elige la forma de pago." }),
  delivered: z.boolean(),
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => value || null),
});

export type ManualSaleInput = z.infer<typeof manualSaleSchema>;

export type ManualSaleResult =
  | { ok: true; id: string; code: string; confirmation: "sent" | "failed" | "skipped"; delivery: { email: Outcome; bonus: BonusOutcome } | null }
  | { ok: false; error: string };

/**
 * Registra una venta presencial (efectivo o transferencia): queda pagada sin Stripe, aparta inventario, manda la
 * confirmación si hay correo y, si ya se entregó, la marca ENTREGADA con el mismo correo de bonus que las compras en línea.
 */
export async function recordManualSale(deps: FulfillmentDeps, input: ManualSaleInput, adminEmail: string): Promise<ManualSaleResult> {
  const campaign = await getCampaignById(deps.db, input.campaignId);
  if (!campaign) return { ok: false, error: "Preventa no encontrada." };
  const subtotal = campaign.unitAmount * input.quantity;
  if (input.amount > subtotal) {
    return { ok: false, error: `El importe no puede ser mayor que el precio × cantidad (${(subtotal / 100).toLocaleString("es-MX", { style: "currency", currency: campaign.currency.toUpperCase() })}).` };
  }

  let sale;
  try {
    sale = await createManualSale(deps.db, {
      campaignId: campaign.id,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      quantity: input.quantity,
      discountAmount: subtotal - input.amount,
      paymentMethod: input.paymentMethod,
      recordedBy: adminEmail,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return { ok: false, error: error.remaining === 0 ? "Ya no quedan piezas disponibles en esta preventa." : `Solo quedan ${error.remaining} piezas disponibles.` };
    }
    throw error;
  }

  if (input.note) await addOrderNote(deps.db, { reservationId: sale.id, body: input.note, authorEmail: adminEmail });
  const confirmation = sale.email ? await sendConfirmationIfNeeded(deps.db, sale.id, { send: deps.send }) : "skipped";

  let delivery: { email: Outcome; bonus: BonusOutcome } | null = null;
  if (input.delivered) {
    const result = await fulfillReservation(deps, sale.id, { type: "delivered" }, adminEmail);
    if (result.ok) delivery = { email: result.email, bonus: result.bonus };
  }
  return { ok: true, id: sale.id, code: sale.code, confirmation, delivery };
}
