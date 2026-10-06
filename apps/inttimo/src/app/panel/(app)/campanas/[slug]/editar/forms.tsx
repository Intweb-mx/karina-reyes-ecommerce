"use client";

import { useActionState, useState } from "react";
import { Alert, buttonClass, inputClass } from "../../../../ui";
import type { ActionState } from "./actions";

type PickupPoint = { id: string; name: string; schedule: string };

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
  pickupPoints: PickupPoint[];
  shippingConfigured: boolean;
  deliveryNote: string;
  questions: string;
};

export function CampaignForm({ action, defaults, hasReservations }: { action: Action; defaults: Defaults; hasReservations: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">
        Producto
        <input name="productName" defaultValue={defaults.productName} required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Estado
        <select name="status" defaultValue={defaults.status} className={inputClass}>
          <option value="draft">Oculta (nadie la ve)</option>
          <option value="active">Activa (se puede comprar en sus fechas)</option>
          <option value="closed">Cerrada (ya no se puede comprar)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Máximo de piezas por compra
        <input name="maxQuantityPerReservation" type="number" min={1} max={20} defaultValue={defaults.maxQuantityPerReservation} className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Abre (hora del centro de México)
        <input name="startsAt" type="datetime-local" defaultValue={defaults.startsAt} required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Cierra (hora del centro de México)
        <input name="endsAt" type="datetime-local" defaultValue={defaults.endsAt} required className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Precio ({defaults.currency})
        <input name="price" inputMode="decimal" defaultValue={defaults.price} required className={inputClass} />
      </label>
      {hasReservations && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="confirmPriceChange" className="size-4 accent-fg" />
          Confirmo cambiar el precio aunque ya haya pedidos (los pedidos anteriores no cambian)
        </label>
      )}
      <fieldset className="grid gap-3 border border-border p-4 text-sm sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-xs font-semibold tracking-[0.12em] text-muted uppercase">Entrega</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pickupEnabled" defaultChecked={defaults.pickupEnabled} className="size-4 accent-fg" />
          Recolección en Chihuahua (sin costo)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shippingEnabled" defaultChecked={defaults.shippingEnabled} className="size-4 accent-fg" />
          Envío a domicilio
        </label>
        <p className="text-xs text-muted sm:col-span-1">
          {defaults.shippingConfigured
            ? "El costo del envío se calcula automáticamente con SkyDropX según la dirección del cliente."
            : "El envío a domicilio todavía no está configurado: pide ayuda a soporte técnico."}
        </p>
        <PickupPointsEditor initial={defaults.pickupPoints} />
      </fieldset>
      <label className="text-sm font-medium sm:col-span-2">
        Nota sobre la entrega (opcional, la ven los clientes)
        <textarea name="deliveryNote" rows={2} defaultValue={defaults.deliveryNote} className={inputClass} />
      </label>
      <input type="hidden" name="questions" value={defaults.questions} />
      <div className="space-y-3 sm:col-span-2">
        <Feedback state={state} />
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Guardando…" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

export function TermsForm({ action, defaultContent }: { action: Action; defaultContent: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-muted">Cada vez que publicas se guarda una versión nueva. Las anteriores no se borran y cada pedido conserva la versión que aceptó el cliente.</p>
      <textarea name="content" rows={12} defaultValue={defaultContent} className={`${inputClass} text-sm`} placeholder="Texto aprobado de los términos de la preventa…" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Publicando…" : "Publicar términos"}</button>
    </form>
  );
}

function PickupPointsEditor({ initial }: { initial: PickupPoint[] }) {
  const [points, setPoints] = useState(initial);
  const update = (index: number, field: "name" | "schedule", value: string) => setPoints((list) => list.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  return (
    <div className="space-y-3 sm:col-span-3">
      <input type="hidden" name="pickupPoints" value={JSON.stringify(points)} />
      <p className="text-xs text-muted">Puntos de recolección</p>
      {points.map((point, index) => (
        <div key={point.id} className="grid gap-3 border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label>
            Lugar
            <input value={point.name} onChange={(e) => update(index, "name", e.target.value)} required maxLength={120} className={inputClass} />
          </label>
          <label>
            Horario
            <input value={point.schedule} onChange={(e) => update(index, "schedule", e.target.value)} required maxLength={200} className={inputClass} />
          </label>
          <button type="button" onClick={() => setPoints((list) => list.filter((_, i) => i !== index))} className="py-2 text-xs text-muted underline underline-offset-4 hover:text-danger">
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPoints((list) => [...list, { id: `punto-${Date.now().toString(36)}`, name: "", schedule: "" }])}
        className="text-xs underline underline-offset-4"
      >
        + Agregar punto
      </button>
    </div>
  );
}
