import { findReservationById, getCampaignById, getPostPurchaseAnswers, getTermsById, listReservationEvents } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { postPurchaseCopy } from "@/content/presale";
import { formatMoney } from "@/lib/format";
import { audit, requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { buttonClass, Card, DELIVERY_LABELS, EVENT_LABELS, FULFILLMENT_LABELS, linkClass, STATUS_LABELS } from "../../../ui";
import { createLabel, retryBonus, updateDelivery } from "./actions";
import { DeliveredForm, LabelForm, ReadyForPickupForm, RetryBonusForm, ShippedForm } from "./DeliveryForms";

export const metadata = { title: "Pedido" };

const when = (date: Date | null) => (date ? date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }) : "—");

function answerText(value: unknown, options?: readonly { value: string; label: string }[]): string {
  const label = (v: string) => options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") return label(value);
  return "—";
}

function stripePaymentUrl(paymentIntentId: string): string {
  // Claves live: sk_live_… (estándar) o rk_live_… (restringida).
  const test = !/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  return `https://dashboard.stripe.com/${test ? "test/" : ""}payments/${paymentIntentId}`;
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Step({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-success text-bg" : "border border-border"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </li>
  );
}

export default async function ReservationPage({ params }: PageProps<"/panel/reservas/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const reservation = await findReservationById(db, id);
  if (!reservation) notFound();
  const [campaign, terms, events, postPurchase] = await Promise.all([
    getCampaignById(db, reservation.campaignId),
    getTermsById(db, reservation.termsId),
    listReservationEvents(db, reservation.id),
    getPostPurchaseAnswers(db, reservation.id),
  ]);
  await audit(admin, { action: "reservation.view", targetType: "reservation", targetId: reservation.id });

  const address = reservation.deliveryAddress
    ? { name: reservation.deliveryAddress.name, line1: `${reservation.deliveryAddress.street}, ${reservation.deliveryAddress.neighborhood}`, line2: reservation.deliveryAddress.reference ? `Referencias: ${reservation.deliveryAddress.reference}` : null, postalCode: reservation.deliveryAddress.postalCode, city: reservation.deliveryAddress.city, state: reservation.deliveryAddress.state }
    : reservation.shippingAddress;
  const fulfillable = reservation.status === "paid" || reservation.status === "partially_refunded";
  const shipping = reservation.deliveryMethod === "shipping";
  const deliver = updateDelivery.bind(null, reservation.id);
  const point = campaign?.pickupPoints.find((p) => p.id === reservation.pickupPointId);
  const selection = reservation.shippingSelection;
  const pending = reservation.fulfillmentStatus === "pending";

  const orderRows: [string, ReactNode][] = [
    ["Estado del pago", STATUS_LABELS[reservation.status]],
    ["Cliente", reservation.fullName],
    ["Correo", reservation.email],
    ["Teléfono", reservation.phone ?? "—"],
    ["Cantidad", `${reservation.quantity} ${reservation.quantity === 1 ? "pieza" : "piezas"}`],
    ["Envío", shipping ? (reservation.shippingAmount ? formatMoney(reservation.shippingAmount, reservation.currency) : "No se cobró") : "Recolección (sin costo)"],
    ["Total pagado", formatMoney(reservation.totalAmount, reservation.currency)],
    ...(reservation.amountRefunded ? ([["Reembolsado", formatMoney(reservation.amountRefunded, reservation.currency)]] as [string, ReactNode][]) : []),
    ["Fecha del pedido", when(reservation.createdAt)],
    ["Fecha del pago", when(reservation.paidAt)],
    ["Aceptó los términos", terms ? `Sí, versión ${terms.version}` : "—"],
    ["Quiere recibir noticias", reservation.marketingConsent ? "Sí" : "No"],
    ...(reservation.stripePaymentIntentId
      ? ([[
          "Pago",
          <a key="stripe" href={stripePaymentUrl(reservation.stripePaymentIntentId)} target="_blank" rel="noreferrer" className={linkClass}>
            Ver en Stripe (para reembolsos)
          </a>,
        ]] as [string, ReactNode][])
      : []),
  ];

  const deliveryRows: [string, ReactNode][] = [
    ["Entrega", DELIVERY_LABELS[reservation.deliveryMethod]],
    ...(shipping
      ? ([["Paquetería que eligió", selection ? `${selection.carrier} ${selection.service}${selection.days ? ` · ${selection.days} ${selection.days === 1 ? "día" : "días"}` : ""}` : "—"]] as [string, ReactNode][])
      : ([["Punto de recolección", point ? `${point.name} · ${point.schedule}` : "Sin punto elegido: confirma con el cliente"]] as [string, ReactNode][])),
    ["Estado de la entrega", FULFILLMENT_LABELS[reservation.fulfillmentStatus]],
    ...(reservation.trackingNumber
      ? ([[
          "Número de guía",
          reservation.trackingUrl ? (
            <a key="track" href={reservation.trackingUrl} target="_blank" rel="noreferrer" className={linkClass}>
              {reservation.carrier ? `${reservation.carrier} · ` : ""}
              {reservation.trackingNumber}
            </a>
          ) : (
            `${reservation.carrier ? `${reservation.carrier} · ` : ""}${reservation.trackingNumber}`
          ),
        ]] as [string, ReactNode][])
      : []),
    ...(reservation.fulfilledAt ? ([[shipping ? "Enviado el" : "Avisado el", when(reservation.fulfilledAt)]] as [string, ReactNode][]) : []),
    ...(reservation.deliveredAt ? ([["Entregado el", when(reservation.deliveredAt)]] as [string, ReactNode][]) : []),
    ...(campaign?.bonus ? ([["Bonus", reservation.bonusSentAt ? `Enviado el ${when(reservation.bonusSentAt)}` : "Aún no se envía"]] as [string, ReactNode][]) : []),
  ];

  const questions = campaign?.questions ?? [];
  const answered = postPurchase?.submittedAt || (postPurchase && Object.keys(postPurchase.answers).length);

  return (
    <div className="space-y-6">
      <div>
        {campaign && <Link href={`/panel/campanas/${campaign.slug}`} className="text-sm text-muted">← Todos los pedidos de {campaign.productName}</Link>}
        <h1 className="mt-1 font-serif text-3xl">{reservation.fullName}</h1>
        <p className="mt-1 text-sm text-muted">
          Folio {reservation.code} · {STATUS_LABELS[reservation.status]} · {DELIVERY_LABELS[reservation.deliveryMethod]} · {FULFILLMENT_LABELS[reservation.fulfillmentStatus]}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title={shipping ? "Envío" : "Recolección"}>
            {!fulfillable ? (
              <p className="text-sm text-muted">Este pedido no está pagado: no se prepara ni se envía.</p>
            ) : shipping ? (
              <ol className="space-y-5">
                <Step n={1} done={!!reservation.labelUrl || !pending}>
                  <p className="font-semibold">Generar la guía</p>
                  {pending && reservation.deliveryAddress ? (
                    <div className="mt-2">
                      <LabelForm action={createLabel.bind(null, reservation.id)} pending={!!reservation.shipmentId} />
                    </div>
                  ) : pending ? (
                    <p className="mt-1 text-muted">Este pedido no tiene dirección completa. Pide la dirección al cliente y genera la guía desde SkyDropX.</p>
                  ) : (
                    <p className="mt-1 text-muted">Lista. El cliente ya recibió su número de guía por correo.</p>
                  )}
                </Step>
                <Step n={2} done={false}>
                  <p className="font-semibold">Imprimir la guía y pegarla en la caja</p>
                  {reservation.labelUrl ? (
                    <a href={reservation.labelUrl} target="_blank" rel="noreferrer" className={`${buttonClass} mt-2 inline-flex`}>
                      Imprimir guía
                    </a>
                  ) : (
                    <p className="mt-1 text-muted">{pending ? "El botón aparece aquí cuando la guía esté generada." : "Esta guía se registró a mano: imprímela desde SkyDropX."}</p>
                  )}
                </Step>
                <Step n={3} done={reservation.fulfillmentStatus === "delivered"}>
                  <p className="font-semibold">Confirmar la entrega</p>
                  {reservation.fulfillmentStatus === "shipped" ? (
                    <div className="mt-2">
                      <p className="mb-2 text-muted">Cuando la paquetería lo entregue:</p>
                      <DeliveredForm action={deliver} />
                    </div>
                  ) : (
                    <p className="mt-1 text-muted">{reservation.fulfillmentStatus === "delivered" ? "Entregado." : "Después de enviarlo."}</p>
                  )}
                </Step>
                {pending && (
                  <li>
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted">¿Hiciste la guía por fuera del panel? Regístrala aquí</summary>
                      <div className="mt-3">
                        <ShippedForm action={deliver} />
                      </div>
                    </details>
                  </li>
                )}
              </ol>
            ) : pending ? (
              <ReadyForPickupForm action={deliver} />
            ) : reservation.fulfillmentStatus === "delivered" ? (
              <p className="text-sm text-muted">El cliente ya recogió su pedido.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted">El cliente ya fue avisado. Cuando lo recoja:</p>
                <DeliveredForm action={deliver} />
              </div>
            )}
            {fulfillable && !pending && !reservation.bonusSentAt && campaign?.bonus && (
              <div className="mt-5 border-t border-border pt-5">
                <p className="mb-2 text-sm text-muted">El bonus no le llegó al cliente.</p>
                <RetryBonusForm action={retryBonus.bind(null, reservation.id)} />
              </div>
            )}
          </Card>

          <Card title="Entrega">
            <Rows rows={deliveryRows} />
          </Card>

          {shipping && (
            <Card title="Dirección de envío">
              {address ? (
                <address className="text-sm not-italic">
                  {address.name}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {address.postalCode} {address.city}, {address.state}
                </address>
              ) : (
                <p className="text-sm text-muted">Sin dirección registrada.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Pedido">
            <Rows rows={orderRows} />
          </Card>

          {questions.length > 0 && (
            <Card title="Respuestas al comprar">
              <dl className="space-y-3 text-sm">
                {questions.map((q) => (
                  <div key={q.id}>
                    <dt className="text-muted">{q.label}</dt>
                    <dd>{answerText(reservation.answers[q.id], q.options)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          <Card title="Cuestionario después de la compra">
            {answered ? (
              <dl className="space-y-3 text-sm">
                {postPurchaseCopy.questions.map((q) => (
                  <div key={q.id}>
                    <dt className="text-muted">{q.label}</dt>
                    <dd>{answerText(postPurchase?.answers[q.id], "options" in q ? q.options : undefined)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">El cliente aún no responde (es opcional).</p>
            )}
          </Card>
        </div>
      </div>

      <Card title="Historial del pedido">
        <ol className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <span className="text-muted">{when(event.createdAt)}</span>
              <span>{EVENT_LABELS[event.type] ?? "Actualización del pedido"}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
