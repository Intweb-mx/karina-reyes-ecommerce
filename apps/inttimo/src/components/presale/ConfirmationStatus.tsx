"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import type { ApiError, ReservationStatusResponse } from "@/server/presale/contract";
import { AlertIcon, ArrowRightIcon, CheckIcon, ClockIcon, CloseIcon, MailIcon, RefundIcon } from "@/components/ui/icons";
import { formatDate, formatMoney } from "@/lib/format";

const POLL_MS = 3000;
const MAX_POLLS = 10;

export type ConfirmationState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: ReservationStatusResponse; gaveUp: boolean };
type Tone = "success" | "pending" | "failed" | "neutral";

const COPY: Record<ReservationStatusResponse["status"], { eyebrow: string; title: string; body: string; tone: Tone }> = {
  paid: { eyebrow: "Gracias por tu reserva", title: "Tu lugar está reservado.", body: "Te enviamos un correo con tu folio. Guárdalo como comprobante.", tone: "success" },
  processing: {
    eyebrow: "Pago en proceso",
    title: "Casi listo.",
    body: "Tu reserva se confirma en cuanto se acredite el pago (por ejemplo, al pagar tu ficha en OXXO). Te avisaremos por correo.",
    tone: "pending",
  },
  pending_payment: { eyebrow: "Un momento", title: "Confirmando tu pago…", body: "Esto tarda unos segundos. No cierres esta página.", tone: "pending" },
  payment_failed: { eyebrow: "Pago no completado", title: "El pago no se completó.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo.", tone: "failed" },
  expired: { eyebrow: "Sesión expirada", title: "La sesión de pago expiró.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo.", tone: "failed" },
  canceled: { eyebrow: "Reserva cancelada", title: "La reserva se canceló.", body: "Puedes intentarlo de nuevo.", tone: "failed" },
  refunded: { eyebrow: "Reembolso", title: "Reserva reembolsada.", body: "El reembolso se procesó a tu método de pago.", tone: "neutral" },
};

const TONE: Record<Tone, { icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }> = {
  success: { icon: CheckIcon, className: "bg-success text-on-ink" },
  pending: { icon: ClockIcon, className: "bg-sand text-warning" },
  failed: { icon: CloseIcon, className: "bg-danger/10 text-danger" },
  neutral: { icon: RefundIcon, className: "bg-sand text-fg" },
};

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

/** Presentación de cada estado; separada de la consulta para poder revisarla sin Stripe. */
export function ConfirmationView({ slug, state, title }: { slug: string; state: ConfirmationState; title?: string }) {
  if (state.kind === "loading") {
    return (
      <div role="status" className="flex items-center gap-5">
        <span aria-hidden="true" className="size-12 shrink-0 animate-spin rounded-full border-2 border-border border-t-fg" />
        <div>
          <p className="eyebrow text-muted">Un momento</p>
          <p className="mt-2 font-serif text-3xl font-medium">Consultando tu reserva…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <Header icon={AlertIcon} toneClass="bg-danger/10 text-danger" eyebrow="Reserva" title={title ?? "No encontramos tu reserva."} body={state.message}>
        <RetryLink slug={slug} />
      </Header>
    );
  }

  const { data, gaveUp } = state;
  const base = COPY[data.status];
  const copy = gaveUp
    ? { ...base, title: "Seguimos confirmando tu pago.", body: "Si ya pagaste, recibirás un correo en cuanto se confirme. No es necesario pagar de nuevo." }
    : base;
  const tone = TONE[copy.tone];
  const retry = ["payment_failed", "expired", "canceled"].includes(data.status);

  return (
    <div aria-live="polite">
      <Header icon={tone.icon} toneClass={tone.className} eyebrow={copy.eyebrow} title={copy.title} body={copy.body} spinning={data.status === "pending_payment" && !gaveUp}>
        {retry && <RetryLink slug={slug} />}
      </Header>

      <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
        <section aria-labelledby="detalle-reserva" className="border border-border bg-surface p-6 sm:p-8">
          <h2 id="detalle-reserva" className="eyebrow text-muted">
            Detalle de tu reserva
          </h2>
          <dl className="mt-6 divide-y divide-border text-sm">
            <Row label="Folio">
              <span className="font-mono text-base tracking-wider">{data.reservationCode}</span>
            </Row>
            <Row label="Producto">{data.productName}</Row>
            <Row label="Cantidad">{data.quantity}</Row>
            <Row label="Correo">{data.email}</Row>
            {data.paidAt && <Row label="Pagado">{formatDate(data.paidAt)}</Row>}
            <Row label="Total">
              <span className="font-serif text-2xl font-medium lining-nums tabular-nums">{formatMoney(data.totalAmount, data.currency)}</span>
            </Row>
          </dl>
        </section>

        {(data.status === "paid" || data.status === "processing") && (
          <section aria-labelledby="que-sigue" className="self-start">
            <h2 id="que-sigue" className="eyebrow text-muted">
              ¿Qué sigue?
            </h2>
            <ul className="mt-6 space-y-5 text-sm leading-relaxed">
              <li className="flex gap-4">
                <MailIcon className="mt-0.5 size-5 shrink-0" />
                <span>
                  {data.status === "paid" ? "Revisa tu bandeja de entrada" : "Al acreditarse el pago te llegará un correo"} en <strong className="font-semibold">{data.email}</strong>. Si no
                  lo ves, busca en spam o promociones.
                </span>
              </li>
              <li className="flex gap-4">
                <CheckIcon className="mt-0.5 size-5 shrink-0" />
                <span>Guarda tu folio: es tu comprobante de reserva.</span>
              </li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Header({
  icon: Icon,
  toneClass,
  eyebrow,
  title,
  body,
  spinning,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  toneClass: string;
  eyebrow: string;
  title: string;
  body: string;
  spinning?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="animate-rise">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`relative grid size-12 shrink-0 place-items-center rounded-full ${toneClass}`}>
          <Icon className="size-6" />
          {spinning && <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-warning" />}
        </span>
        <p className="eyebrow text-muted">{eyebrow}</p>
      </div>
      <h1 className="mt-8 font-serif text-[clamp(2.75rem,8vw,5rem)] leading-[0.95] font-medium tracking-[-0.015em] text-balance">{title}</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function RetryLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/preventa/${slug}`}
      className="group mt-10 inline-flex items-center gap-3 bg-accent px-6 py-4 text-sm font-semibold tracking-[0.16em] text-bg uppercase transition-colors duration-(--duration-base) hover:bg-ink/85"
    >
      Volver a la preventa
      <ArrowRightIcon className="size-4 transition-transform duration-(--duration-base) group-hover:translate-x-0.5" />
    </Link>
  );
}
