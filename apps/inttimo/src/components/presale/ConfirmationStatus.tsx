"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiError, ReservationStatusResponse } from "@/server/presale/contract";
import { formatMoney } from "@/lib/format";

const POLL_MS = 3000;
const MAX_POLLS = 10;

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: ReservationStatusResponse; gaveUp: boolean };

const COPY: Record<ReservationStatusResponse["status"], { title: string; body: string }> = {
  paid: { title: "Tu lugar está reservado.", body: "Te enviamos un correo con tu folio. Guárdalo como comprobante." },
  processing: { title: "Pago en proceso.", body: "Tu reserva se confirma en cuanto se acredite el pago (por ejemplo, al pagar tu ficha en OXXO). Te avisaremos por correo." },
  pending_payment: { title: "Confirmando tu pago…", body: "Esto tarda unos segundos." },
  payment_failed: { title: "El pago no se completó.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo." },
  expired: { title: "La sesión de pago expiró.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo." },
  canceled: { title: "La reserva se canceló.", body: "Puedes intentarlo de nuevo." },
  refunded: { title: "Reserva reembolsada.", body: "El reembolso se procesó a tu método de pago." },
};

export function ConfirmationStatus({ slug, sessionId }: { slug: string; sessionId: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });

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

  if (!sessionId) return <Message title="Enlace incompleto." body="Revisa el correo de confirmación o vuelve a la preventa." slug={slug} />;
  if (state.kind === "loading") return <Message title="Consultando tu reserva…" />;
  if (state.kind === "error") return <Message title="No encontramos tu reserva." body={state.message} slug={slug} />;

  const { data, gaveUp } = state;
  const copy = gaveUp
    ? { title: "Seguimos confirmando tu pago.", body: "Si ya pagaste, recibirás un correo en cuanto se confirme. No es necesario pagar de nuevo." }
    : COPY[data.status];
  const retry = ["payment_failed", "expired", "canceled"].includes(data.status);

  return (
    <div aria-live="polite">
      <Message title={copy.title} body={copy.body} slug={retry ? slug : undefined} />
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-8 text-sm">
        <dt className="text-muted">Folio</dt>
        <dd className="font-mono">{data.reservationCode}</dd>
        <dt className="text-muted">Producto</dt>
        <dd>{data.productName}</dd>
        <dt className="text-muted">Cantidad</dt>
        <dd>{data.quantity}</dd>
        <dt className="text-muted">Total</dt>
        <dd>{formatMoney(data.totalAmount, data.currency)}</dd>
        <dt className="text-muted">Correo</dt>
        <dd>{data.email}</dd>
      </dl>
    </div>
  );
}

function Message({ title, body, slug }: { title: string; body?: string; slug?: string }) {
  return (
    <div>
      <h1 className="mt-4 font-serif text-4xl sm:text-5xl">{title}</h1>
      {body && <p className="mt-4 text-muted">{body}</p>}
      {slug && (
        <Link href={`/preventa/${slug}`} className="mt-8 inline-block bg-accent px-6 py-3 text-sm tracking-[0.18em] text-bg uppercase">
          Volver a la preventa
        </Link>
      )}
    </div>
  );
}
