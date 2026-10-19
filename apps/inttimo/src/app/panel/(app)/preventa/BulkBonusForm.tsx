"use client";

import { useActionState } from "react";
import { Alert, buttonClass } from "../../ui";
import type { BulkBonusState } from "./actions";

type Action = (state: BulkBonusState, form: FormData) => Promise<BulkBonusState>;

/** `pending`: compras pagadas con correo que aún no reciben el bonus. */
export function BulkBonusForm({ action, pending: waiting, total }: { action: Action; pending: number; total: number }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const all = new FormData(event.currentTarget).get("includeAlreadySent") === "on";
        const count = all ? total : waiting;
        if (!confirm(`Se enviará el bonus por correo a ${count} ${count === 1 ? "persona" : "personas"}. ¿Continuar?`)) event.preventDefault();
      }}
      className="space-y-3"
    >
      <p className="text-sm text-muted">
        Manda el bonus a todas las compras pagadas, sin importar la fecha de pago ni si el pedido ya se entregó. Faltan {waiting} de {total}{" "}
        {total === 1 ? "compra" : "compras"} con correo. Puede tardar unos minutos: no cierres la página.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="includeAlreadySent" />
        Reenviarlo también a quienes ya lo recibieron (con un enlace nuevo; el anterior sigue funcionando)
      </label>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">{state.ok}</Alert>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Enviando… no cierres la página" : "Enviar bonus a todos"}
      </button>
    </form>
  );
}
