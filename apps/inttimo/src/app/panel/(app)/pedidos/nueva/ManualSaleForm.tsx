"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/lib/format";
import { Alert, buttonClass, inputClass } from "../../../ui";
import { registerManualSale } from "./actions";

export type SaleCampaign = { id: string; name: string; unitAmount: number; currency: string; remaining: number | null };

const toPesos = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");

export function ManualSaleForm({ campaigns }: { campaigns: SaleCampaign[] }) {
  const [state, formAction, pending] = useActionState(registerManualSale, undefined);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const campaign = campaigns.find((c) => c.id === campaignId) ?? campaigns[0];
  const listPrice = (campaign?.unitAmount ?? 0) * quantity;
  // El importe sigue al precio de lista hasta que Karina lo cambia a mano (descuento).
  const [amount, setAmount] = useState<string | null>(null);
  const shownAmount = amount ?? toPesos(listPrice);
  const cents = Math.round(Number(shownAmount.replace(/[$,\s]/g, "")) * 100);
  const discount = Number.isFinite(cents) ? listPrice - cents : 0;

  if (!campaign) return <Alert>No hay preventas para registrar ventas.</Alert>;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {campaigns.length > 1 ? (
        <label className="text-sm font-medium sm:col-span-2">
          Preventa
          <select name="campaignId" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setAmount(null); }} className={inputClass}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="campaignId" value={campaign.id} />
      )}

      <label className="text-sm font-medium">
        Nombre del cliente
        <input name="fullName" required minLength={2} maxLength={120} autoComplete="off" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Correo (opcional)
        <input name="email" type="email" maxLength={254} autoComplete="off" className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-muted">Sin correo no recibe confirmación ni el bonus.</span>
      </label>
      <label className="text-sm font-medium">
        Teléfono (opcional)
        <input name="phone" type="tel" maxLength={30} autoComplete="off" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Cantidad
        <input
          name="quantity"
          type="number"
          min={1}
          max={50}
          required
          value={quantity}
          onChange={(e) => { setQuantity(Math.max(1, Number(e.target.value) || 1)); setAmount(null); }}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-muted">
          {campaign.remaining === null ? "Sin límite de piezas." : `Quedan ${campaign.remaining} piezas.`}
        </span>
      </label>
      <label className="text-sm font-medium">
        Importe cobrado (pesos)
        <input name="amount" inputMode="decimal" required value={shownAmount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        <span className="mt-1 block text-xs font-normal text-muted">
          Precio de lista: {formatMoney(listPrice, campaign.currency)}
          {discount > 0 ? ` · descuento de ${formatMoney(discount, campaign.currency)}` : ""}
        </span>
      </label>
      <fieldset className="text-sm font-medium">
        <legend>Forma de pago</legend>
        <div className="mt-2 flex gap-4 font-normal">
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="radio" name="paymentMethod" value="cash" defaultChecked /> Efectivo
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="radio" name="paymentMethod" value="transfer" /> Transferencia
          </label>
        </div>
      </fieldset>
      <label className="text-sm font-medium sm:col-span-2">
        Nota interna (opcional)
        <textarea name="note" rows={2} maxLength={1000} className={inputClass} placeholder="Ej.: vendido en Iglesia Baluarte el domingo." />
      </label>
      <label className="inline-flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="delivered" className="mt-1 size-4" />
        <span>
          <span className="font-medium">Ya le entregué el juego</span>
          <span className="block text-muted">Marca el pedido como ENTREGADO y, si hay correo, le manda en este momento el correo con su bonus.</span>
        </span>
      </label>
      <div className="space-y-3 sm:col-span-2">
        {state?.error && <Alert>{state.error}</Alert>}
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Registrando…" : "Registrar venta"}</button>
      </div>
    </form>
  );
}
