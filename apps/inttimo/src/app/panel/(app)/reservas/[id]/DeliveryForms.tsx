"use client";

import { useActionState } from "react";
import { Alert, buttonClass, inputClass, secondaryButtonClass } from "../../../ui";
import type { DeliveryState } from "./actions";

type Action = (state: DeliveryState, form: FormData) => Promise<DeliveryState>;

function Feedback({ state }: { state: DeliveryState }) {
  if (state?.error) return <Alert>{state.error}</Alert>;
  if (state?.ok) return <Alert tone="ok">{state.ok}</Alert>;
  return null;
}

export function ReadyForPickupForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="ready_for_pickup" />
      <label className="block text-sm">
        Punto, fecha y horario de recolección (va en el correo al cliente)
        <textarea name="note" rows={3} required className={inputClass} placeholder="Ej.: Costco …, sábado 18 de octubre de 10:00 a 13:00." />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Guardando…" : "Marcar LISTO PARA RECOGER y avisar"}</button>
    </form>
  );
}

export function ShippedForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="type" value="shipped" />
      <label className="text-sm">
        Paquetería
        <input name="carrier" required maxLength={80} className={inputClass} />
      </label>
      <label className="text-sm">
        Número de guía
        <input name="trackingNumber" required maxLength={80} className={inputClass} />
      </label>
      <label className="text-sm sm:col-span-2">
        URL de rastreo (opcional)
        <input name="trackingUrl" type="url" maxLength={500} className={inputClass} />
      </label>
      <label className="text-sm sm:col-span-2">
        Nota para el cliente (opcional)
        <textarea name="note" rows={2} className={inputClass} />
      </label>
      <div className="space-y-3 sm:col-span-2">
        <Feedback state={state} />
        <button type="submit" disabled={pending} className={buttonClass}>{pending ? "Guardando…" : "Marcar ENVIADO y avisar"}</button>
      </div>
    </form>
  );
}

export function DeliveredForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="delivered" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>{pending ? "Guardando…" : "Marcar como ENTREGADO"}</button>
    </form>
  );
}

export function RetryBonusForm({ action }: { action: () => Promise<DeliveryState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>{pending ? "Enviando…" : "Reintentar bonus"}</button>
    </form>
  );
}
