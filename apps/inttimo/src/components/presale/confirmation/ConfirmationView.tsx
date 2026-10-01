"use client";

import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { ReservationStatusResponse } from "@/server/presale/contract";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AlertIcon, BoxIcon, CalendarIcon, CheckIcon, ClockIcon, CloseIcon, MailIcon, PrintIcon, ReceiptIcon, RefundIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { business, legalPaths } from "@/content/legal";
import { legalNotice, slowPaymentCopy, statusCopy, type Tone } from "@/content/presale";
import { getProductContent } from "@/content/products";
import { formatCalendarDate, formatDate, formatMoney } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { StatusTimeline } from "./StatusTimeline";

export type ConfirmationState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: ReservationStatusResponse; gaveUp: boolean };

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TONE: Record<Tone, { icon: Icon; className: string }> = {
  success: { icon: CheckIcon, className: "bg-success text-on-ink" },
  pending: { icon: ClockIcon, className: "bg-sand text-warning" },
  failed: { icon: CloseIcon, className: "bg-danger/10 text-danger" },
  neutral: { icon: RefundIcon, className: "bg-sand text-fg" },
};

/** Presentación de cada estado de la reserva; separada de la consulta para poder revisarla sin Stripe. */
export function ConfirmationView({ slug, state, title }: { slug: string; state: ConfirmationState; title?: string }) {
  if (state.kind === "loading") return <LoadingState />;

  if (state.kind === "error") {
    return (
      <Header icon={AlertIcon} toneClass="bg-danger/10 text-danger" eyebrow="Compra" title={title ?? "No encontramos tu compra."} body={state.message}>
        <RetryLink slug={slug} />
      </Header>
    );
  }

  const { data, gaveUp } = state;
  const base = statusCopy[data.status];
  const copy = gaveUp ? { ...base, ...slowPaymentCopy } : base;
  const tone = TONE[copy.tone];
  const retry = data.status === "payment_failed" || data.status === "expired" || data.status === "canceled";
  const settled = data.status === "paid" || data.status === "processing";
  const launchDate = getProductContent(slug)?.launchDate;
  const launch = launchDate ? formatCalendarDate(launchDate) : null;

  return (
    <div aria-live="polite">
      <Header icon={tone.icon} toneClass={tone.className} eyebrow={copy.eyebrow} title={copy.title} body={copy.body} spinning={data.status === "pending_payment" && !gaveUp}>
        {retry && <RetryLink slug={slug} />}
        {settled && (
          <div className="mt-10 flex flex-wrap gap-3 print:hidden">
            <CopyButton value={data.reservationCode} label="Copiar folio" appearance="button" />
            <Button type="button" variant="ghost" size="md" icon={<PrintIcon className="size-4" />} onClick={() => window.print()}>
              Imprimir comprobante
            </Button>
          </div>
        )}
      </Header>

      <div className="mt-12 border-y border-border py-8">
        <StatusTimeline status={data.status} />
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
        <section aria-labelledby="detalle-compra" className="border border-border bg-surface p-6 sm:p-8 print:border-fg/40">
          <div className="flex items-center justify-between gap-4">
            <h2 id="detalle-compra" className="eyebrow text-muted">
              Detalle de tu compra
            </h2>
          </div>
          <dl className="mt-6 divide-y divide-border text-sm">
            <Row label="Folio de compra">
              <span className="flex flex-wrap items-center justify-end gap-3">
                <span className="font-mono text-base tracking-wider">{data.reservationCode}</span>
                <CopyButton value={data.reservationCode} label="Copiar" />
              </span>
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

        {settled && (
          <section aria-labelledby="que-sigue" className="self-start print:hidden">
            <h2 id="que-sigue" className="eyebrow text-muted">
              ¿Qué sigue?
            </h2>
            <ul className="mt-6 space-y-5 text-sm leading-relaxed">
              <li className="flex gap-4">
                <MailIcon className="mt-0.5 size-5 shrink-0" />
                <span>
                  {data.status === "paid" ? "Revisa tu bandeja de entrada" : "Al acreditarse el pago te llegará un correo"} en <strong className="font-semibold">{data.email}</strong>. Si no lo
                  ves, busca en spam o promociones.
                </span>
              </li>
              {launch && (
                <li className="flex gap-4">
                  <CalendarIcon className="mt-0.5 size-5 shrink-0" />
                  <span>
                    Tu pedido queda registrado para el lanzamiento oficial del <strong className="font-semibold lining-nums">{launch}</strong>.
                  </span>
                </li>
              )}
              <li className="flex gap-4">
                <CheckIcon className="mt-0.5 size-5 shrink-0" />
                <span>Guarda tu folio: es el comprobante de tu compra de preventa.</span>
              </li>
              <li className="flex gap-4">
                <BoxIcon className="mt-0.5 size-5 shrink-0" />
                <span>
                  Si es con envío, te comunicaremos la guía de rastreo. Si es con recolección en Chihuahua, te avisaremos cuando esté LISTO PARA RECOGER. Consulta la{" "}
                  <Link href={legalPaths.shipping} className="underline underline-offset-4">
                    Política de Envíos y Recolección
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-4">
                <ReceiptIcon className="mt-0.5 size-5 shrink-0" />
                <span>{legalNotice.invoice}</span>
              </li>
            </ul>
          </section>
        )}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-sm leading-relaxed text-muted">
        ¿Dudas o incidencias con tu compra? Escríbenos a{" "}
        <a href={`mailto:${business.email}`} className="underline underline-offset-4 hover:text-fg">
          {business.email}
        </a>{" "}
        o por{" "}
        <a href={business.whatsappUrl} rel="noopener" className="underline underline-offset-4 hover:text-fg">
          WhatsApp {business.whatsapp}
        </a>{" "}
        ({business.hours}; respuesta {business.responseTime}). Consulta la{" "}
        <Link href={legalPaths.refunds} className="underline underline-offset-4 hover:text-fg">
          Política de Cambios y Reembolsos
        </Link>
        .
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-busy="true">
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-sand text-muted">
          <Spinner className="size-5" />
        </span>
        <p className="eyebrow text-muted">Un momento</p>
      </div>
      <p className="mt-8 font-serif text-[clamp(2.75rem,8vw,5rem)] leading-[0.95] font-medium">Consultando tu compra…</p>
      <div aria-hidden="true" className="mt-12 h-56 max-w-2xl border border-border bg-surface motion-safe:animate-pulse" />
    </div>
  );
}

function Header({ icon: Icon, toneClass, eyebrow, title, body, spinning, children }: { icon: Icon; toneClass: string; eyebrow: string; title: string; body: string; spinning?: boolean; children?: ReactNode }) {
  return (
    <div className="animate-rise">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`relative grid size-12 shrink-0 place-items-center rounded-full ${toneClass}`}>
          <Icon className="animate-pop size-6 [animation-delay:200ms]" />
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
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function RetryLink({ slug }: { slug: string }) {
  return (
    <ButtonLink href={`/preventa/${slug}`} className="mt-10">
      Volver a la preventa
    </ButtonLink>
  );
}
