"use client";

import { useEffect, useState } from "react";
import type { ApiError, ReservationStatusResponse } from "@/server/presale/contract";
import { ConfirmationView, type ConfirmationState } from "./ConfirmationView";

const POLL_MS = 3000;
const MAX_POLLS = 10;

/** Consulta el estado de la reserva al volver de Stripe; reintenta cada 3 s mientras el pago esté pendiente (~30 s). */
export function ConfirmationStatus({ slug, sessionId }: { slug: string; sessionId: string | null }) {
  const [state, setState] = useState<ConfirmationState>({ kind: "loading" });

  useEffect(() => {
    if (!sessionId) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/preventa/${slug}/confirmacion?session_id=${encodeURIComponent(sessionId!)}`, { cache: "no-store" });
        const data = (await response.json()) as ReservationStatusResponse | ApiError;
        if (!active) return;
        if ("error" in data) return setState({ kind: "error", message: data.error.message });
        polls++;
        const waiting = data.status === "pending_payment";
        setState({ kind: "ready", data, gaveUp: waiting && polls >= MAX_POLLS });
        if (waiting && polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
      } catch {
        if (active) setState({ kind: "error", message: "No pudimos consultar tu reserva. Recarga la página en un momento." });
      }
    }

    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, sessionId]);

  if (!sessionId) {
    return <ConfirmationView slug={slug} state={{ kind: "error", message: "Revisa el correo de confirmación o vuelve a la preventa." }} title="Enlace incompleto." />;
  }
  return <ConfirmationView slug={slug} state={state} />;
}
