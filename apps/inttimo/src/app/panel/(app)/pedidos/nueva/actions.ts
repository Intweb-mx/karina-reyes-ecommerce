"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, getAdminState } from "@/server/auth/admin";
import { manualSaleSchema, recordManualSale } from "@/server/presale/manual-sale";
import { getFulfillmentDeps } from "@/server/presale/runtime";

export type ManualSaleState = { error?: string } | undefined;

export async function registerManualSale(_state: ManualSaleState, form: FormData): Promise<ManualSaleState> {
  const state = await getAdminState();
  if (state.status !== "ok") return { error: "Sesión vencida. Vuelve a entrar." };

  const parsed = manualSaleSchema.safeParse({
    campaignId: form.get("campaignId"),
    fullName: form.get("fullName") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    quantity: form.get("quantity"),
    amount: form.get("amount") ?? "",
    paymentMethod: form.get("paymentMethod"),
    delivered: form.get("delivered") === "on",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la venta." };

  const result = await recordManualSale(getFulfillmentDeps(), parsed.data, state.admin.email);
  if (!result.ok) return { error: result.error };
  await audit(state.admin, {
    action: "reservation.manual_sale",
    targetType: "reservation",
    targetId: result.id,
    metadata: { code: result.code, paymentMethod: parsed.data.paymentMethod, amount: parsed.data.amount, delivered: parsed.data.delivered },
  });
  revalidatePath("/panel");
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel/preventa");
  redirect(`/panel/pedidos/${result.id}`);
}
