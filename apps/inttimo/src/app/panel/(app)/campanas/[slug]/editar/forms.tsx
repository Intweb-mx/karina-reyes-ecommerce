"use client";

import { useActionState } from "react";
import { Alert, buttonClass, inputClass } from "../../../../ui";
import type { ActionState } from "./actions";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <Alert>{state.error}</Alert>;
  if (state?.ok) return <Alert tone="ok">{state.ok}</Alert>;
  return null;
}

type Defaults = {
  productName: string;
  status: string;
  startsAt: string;
  endsAt: string;
  price: string;
  currency: string;
  maxQuantityPerReservation: number;
  pickupEnabled: boolean;
  shippingEnabled: boolean;
  shippingAmount: string;
  deliveryNote: string;
  questions: string;
};

export function CampaignForm({ action, defaults, hasReservations }: { action: Action; defaults: Defaults; hasReservations: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        Producto
        <input name="productName" defaultValue={defaults.productName} required className={inputClass} />
      </label>
      <label className="text-sm">
        Estado
        <select name="status" defaultValue={defaults.status} className={inputClass}>
          <option value="draft">Borrador (no visible)</option>
          <option value="active">Activa</option>
          <option value="closed">Cerrada</option>
        </select>
      </label>
      <label className="text-sm">
        Máximo por reserva
        <input name="maxQuantityPerReservation" type="number" min={1} max={20} defaultValue={defaults.maxQuantityPerReservation} className={inputClass} />
      </label>
      <label className="text-sm">
        Inicio (hora CDMX)
        <input name="startsAt" type="datetime-local" defaultValue={defaults.startsAt} required className={inputClass} />
      </label>
      <label className="text-sm">
        Cierre (hora CDMX)
        <input name="endsAt" type="datetime-local" defaultValue={defaults.endsAt} required className={inputClass} />
      </label>
      <label className="text-sm">
        Precio ({defaults.currency})
        <input name="price" inputMode="decimal" defaultValue={defaults.price} required className={inputClass} />
      </label>
      {hasReservations && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="confirmPriceChange" className="size-4 accent-fg" />
          Confirmo cambiar el precio aunque ya haya reservas
        </label>
      )}
      <fieldset className="grid gap-3 border border-border p-4 text-sm sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-xs text-muted">Entrega</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pickupEnabled" defaultChecked={defaults.pickupEnabled} className="size-4 accent-fg" />
          Recolección en Chihuahua (sin costo)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shippingEnabled" defaultChecked={defaults.shippingEnabled} className="size-4 accent-fg" />
          Envío a domicilio
        </label>
        <label>
          Costo de envío por pedido ({defaults.currency})
          <input name="shippingAmount" inputMode="decimal" defaultValue={defaults.shippingAmount} placeholder="Vacío = por cotizar" className={inputClass} />
        </label>
        <span className="text-xs text-muted sm:col-span-3">Vacío: el envío no se cobra en línea y se cotiza con el cliente. Los pedidos ya pagados conservan lo que pagaron.</span>
      </fieldset>
      <label className="text-sm sm:col-span-2">
        Nota de entrega (opcional, visible al público)
        <textarea name="deliveryNote" rows={2} defaultValue={defaults.deliveryNote} className={inputClass} />
      </label>
      <label className="text-sm sm:col-span-2">
        Preguntas del cuestionario (JSON)
        <textarea name="questions" rows={14} defaultValue={defaults.questions} spellCheck={false} className={`${inputClass} font-mono text-xs`} />
        <span className="mt-1 block text-xs text-muted">Tipos: text, textarea, select, multiselect, boolean. Ver docs/preventa/README.md.</span>
      </label>
      <div className="space-y-3 sm:col-span-2">
        <Feedback state={state} />
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Guardando…" : "Guardar campaña"}</button>
      </div>
    </form>
  );
}

export function TermsForm({ action, defaultContent }: { action: Action; defaultContent: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-muted">Cada publicación crea una versión nueva; las anteriores se conservan y cada reserva guarda la versión que aceptó.</p>
      <textarea name="content" rows={12} defaultValue={defaultContent} className={`${inputClass} text-sm`} placeholder="Texto aprobado de los términos de la preventa…" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Publicando…" : "Publicar términos"}</button>
    </form>
  );
}
