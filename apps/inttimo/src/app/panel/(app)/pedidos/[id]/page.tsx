import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { INCIDENT_LABELS, type OrderDetail } from "@/server/admin/contract";
import { getOrderDetail } from "@/server/admin/orders";
import { audit, requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Alert, Badge, buttonClass, Card, DELIVERY_LABELS, EmptyState, EVENT_LABELS, FULFILLMENT_LABELS, FULFILLMENT_TONES, linkClass, PageHeader, secondaryButtonClass, STATUS_LABELS, STATUS_TONES, PAYMENT_METHOD_LABELS } from "../../../ui";
import { addNote, createLabel, handToCarrierAction, resendEmail, retryBonus, updateDelivery } from "./actions";
import { DeliveredForm, HandToCarrierForm, LabelForm, NoteForm, ReadyForPickupForm, ResendEmailForm, RetryBonusForm, ShippedForm } from "./DeliveryForms";

export const metadata = { title: "Pedido" };

const when = (date: Date | null) => (date ? date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }) : "—");
const pieces = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

/** Teléfono mexicano de 10 dígitos → número internacional para WhatsApp (sin inventar si no es claro). */
function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  return null;
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

function Tracking({ delivery }: { delivery: OrderDetail["delivery"] }) {
  const text = `${delivery.carrier ? `${delivery.carrier} · ` : ""}${delivery.trackingNumber}`;
  return delivery.trackingUrl ? (
    <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className={linkClass}>
      {text}
    </a>
  ) : (
    <>{text}</>
  );
}

function NextStepCard({ order }: { order: OrderDetail }) {
  const step = order.nextStep;
  const deliver = updateDelivery.bind(null, order.id);
  const actionable = step.type !== "none" && step.type !== "not_paid";
  let body: ReactNode;
  switch (step.type) {
    case "not_paid":
      body = <p className="text-sm text-muted">Este pedido no está pagado: no se prepara ni se envía.</p>;
      break;
    case "generate_label":
      body = (
        <div className="space-y-4">
          {step.blocked ? (
            <p className="text-sm">
              {order.delivery.address
                ? "La dirección de este pedido no se capturó en el formato de SkyDropX. Genera la guía en SkyDropX con la dirección de abajo y regístrala aquí."
                : "Este pedido no tiene dirección completa. Pide la dirección al cliente, genera la guía en SkyDropX y regístrala abajo."}
            </p>
          ) : (
            <LabelForm action={createLabel.bind(null, order.id)} pending={step.inProgress} />
          )}
          <details className="text-sm" open={!!step.blocked}>
            <summary className="cursor-pointer text-muted">¿Hiciste la guía por fuera del panel y ya entregaste el paquete? Regístrala aquí</summary>
            <div className="mt-3">
              <ShippedForm action={deliver} />
            </div>
          </details>
        </div>
      );
      break;
    case "hand_to_carrier":
      body = (
        <ol className="space-y-4 text-sm">
          <li>
            <p className="font-semibold">1. Imprime la guía y pégala en la caja</p>
            {order.delivery.labelUrl ? (
              <a href={order.delivery.labelUrl} target="_blank" rel="noreferrer" className={`${buttonClass} mt-2 inline-flex`}>
                Imprimir guía
              </a>
            ) : (
              <p className="mt-1 text-muted">Imprímela desde SkyDropX (guía {order.delivery.trackingNumber}).</p>
            )}
          </li>
          <li>
            <p className="font-semibold">2. Cuando entregues el paquete a {order.delivery.carrier ?? "la paquetería"}, avísalo aquí</p>
            <p className="mt-1 mb-2 text-muted">El cliente recibe su número de guía por correo.</p>
            <HandToCarrierForm action={handToCarrierAction.bind(null, order.id)} />
          </li>
        </ol>
      );
      break;
    case "mark_delivered":
      body = (
        <div className="space-y-2 text-sm">
          <p>Enviado. Cuando la paquetería lo entregue{order.bonus.configured ? " (al marcarlo, el cliente recibe su bonus por correo)" : ""}:</p>
          <DeliveredForm action={deliver} />
        </div>
      );
      break;
    case "notify_ready":
      body = <ReadyForPickupForm action={deliver} />;
      break;
    case "mark_picked_up":
      body = (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {order.payment.method !== "stripe" ? "Venta en persona. Cuando le entregues el juego" : "El cliente ya fue avisado. Cuando lo recoja"}
            {order.bonus.configured && order.customer.email ? " (al marcarlo, recibe su bonus por correo)" : ""}:
          </p>
          <DeliveredForm action={deliver} />
        </div>
      );
      break;
    case "none":
      body = <p className="text-sm text-muted">Entregado. No hay nada pendiente.</p>;
      break;
  }
  return (
    <Card title="Siguiente paso" className={actionable ? "border-warning/40 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-warning)_10%,transparent)]" : ""}>
      {body}
    </Card>
  );
}

export default async function OrderPage({ params }: PageProps<"/panel/pedidos/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const order = await getOrderDetail(getDb(), id);
  if (!order) notFound();
  await audit(admin, { action: "reservation.view", targetType: "reservation", targetId: order.id });

  const { customer, payment, delivery } = order;
  const paid = payment.status === "paid" || payment.status === "partially_refunded";
  const shipping = delivery.method === "shipping";
  const whatsapp = whatsappNumber(customer.phone);

  const customerRows: [string, ReactNode][] = [
    ["Correo", customer.email],
    ["Teléfono", customer.phone ?? "—"],
    ["Entrega", DELIVERY_LABELS[delivery.method]],
    ...(shipping
      ? ([
          ["Dirección", delivery.address ? delivery.address.map((line) => <span key={line} className="block">{line}</span>) : "Sin dirección registrada"],
          ["Paquetería que eligió", delivery.selection ?? "—"],
        ] as [string, ReactNode][])
      : ([["Punto de recolección", payment.method !== "stripe" ? "Entrega en persona" : delivery.pickupPoint ? `${delivery.pickupPoint.name} · ${delivery.pickupPoint.schedule}` : "Sin punto elegido: confirma con el cliente"]] as [string, ReactNode][])),
    ...(delivery.trackingNumber ? ([["Guía", <Tracking key="t" delivery={delivery} />]] as [string, ReactNode][]) : []),
    ...(delivery.fulfilledAt ? ([[shipping ? "Enviado el" : "Avisado el", when(delivery.fulfilledAt)]] as [string, ReactNode][]) : []),
    ...(delivery.deliveredAt ? ([["Entregado el", when(delivery.deliveredAt)]] as [string, ReactNode][]) : []),
    ...(order.bonus.configured ? ([["Bonus", order.bonus.sentAt ? `Enviado el ${when(order.bonus.sentAt)}` : "Aún no se envía"]] as [string, ReactNode][]) : []),
    ["Quiere recibir noticias", customer.marketingConsent ? "Sí" : "No"],
  ];

  const paymentRows: [string, ReactNode][] = [
    ["Producto", `${order.campaign?.productName ?? "—"} · ${pieces(payment.quantity)} × ${formatMoney(payment.unitAmount, payment.currency)}`],
    ["Envío", shipping ? (payment.shippingAmount ? formatMoney(payment.shippingAmount, payment.currency) : "No se cobró") : "Recolección (sin costo)"],
    ...(payment.discountAmount ? ([["Descuento", formatMoney(payment.discountAmount, payment.currency)]] as [string, ReactNode][]) : []),
    ["Total pagado", formatMoney(payment.totalAmount, payment.currency)],
    ["Forma de pago", PAYMENT_METHOD_LABELS[payment.method]],
    ...(payment.recordedBy ? ([["Venta registrada por", payment.recordedBy]] as [string, ReactNode][]) : []),
    ...(payment.amountRefunded ? ([["Reembolsado", formatMoney(payment.amountRefunded, payment.currency)]] as [string, ReactNode][]) : []),
    ["Pedido", when(payment.createdAt)],
    ["Pago", when(payment.paidAt)],
    ["Aceptó los términos", payment.termsVersion ? `Sí, versión ${payment.termsVersion}` : payment.method !== "stripe" ? "No aplica (venta en persona)" : "—"],
    ...(payment.stripeUrl
      ? ([[
          "Stripe",
          <a key="stripe" href={payment.stripeUrl} target="_blank" rel="noreferrer" className={linkClass}>
            Ver el pago en Stripe
          </a>,
        ]] as [string, ReactNode][])
      : []),
  ];

  const canResendFulfillment = delivery.status === "shipped" || delivery.status === "ready_for_pickup";
  const canRetryBonus = paid && order.bonus.configured && !order.bonus.sentAt && delivery.status === "delivered";

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link prefetch={false} href="/panel/pedidos" className="hover:text-fg">
            ← Pedidos
          </Link>
        }
        title={customer.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-fg">{order.code}</span>
            <Badge tone={STATUS_TONES[payment.status]}>{STATUS_LABELS[payment.status]}</Badge>
            <Badge tone="neutral">{DELIVERY_LABELS[delivery.method]}</Badge>
            {paid && <Badge tone={FULFILLMENT_TONES[delivery.status]}>{FULFILLMENT_LABELS[delivery.status]}</Badge>}
          </span>
        }
        actions={
          <>
            <a href={`mailto:${customer.email}?subject=${encodeURIComponent(`Tu pedido ${order.code}`)}`} className={secondaryButtonClass}>
              Escribir correo
            </a>
            {customer.phone && (
              <a href={`tel:${customer.phone.replace(/[^+\d]/g, "")}`} className={secondaryButtonClass}>
                Llamar
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                WhatsApp
              </a>
            )}
          </>
        }
      />

      {order.incidents.map((incident) => (
        <Alert key={incident}>{INCIDENT_LABELS[incident]}</Alert>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <NextStepCard order={order} />

          <Card title="Cliente y entrega">
            <Rows rows={customerRows} />
            {paid && (
              <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
                <ResendEmailForm action={resendEmail.bind(null, order.id, "confirmation")} label="Reenviar confirmación de pago" />
                {canResendFulfillment && (
                  <ResendEmailForm action={resendEmail.bind(null, order.id, "fulfillment")} label={shipping ? "Reenviar aviso de envío" : "Reenviar aviso de recolección"} />
                )}
                {canRetryBonus && <RetryBonusForm action={retryBonus.bind(null, order.id)} />}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Pago">
            <Rows rows={paymentRows} />
          </Card>

          {(order.answers.length > 0 || order.postPurchase) && (
            <Card title="Respuestas del cliente">
              <dl className="space-y-3 text-sm">
                {[...order.answers, ...(order.postPurchase ?? [])].map((row, index) => (
                  <div key={`${index}-${row.label}`}>
                    <dt className="text-muted">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {!order.postPurchase && <p className="mt-3 text-xs text-muted">El cuestionario después de la compra aún no tiene respuestas (es opcional).</p>}
            </Card>
          )}

          <Card title="Notas internas" description="Solo las ve el equipo. No se pueden editar ni borrar.">
            {order.notes.length > 0 && (
              <ul className="mb-5 space-y-3 text-sm">
                {order.notes.map((note) => (
                  <li key={note.id} className="border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {note.authorEmail} · {when(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm action={addNote.bind(null, order.id)} />
          </Card>
        </div>
      </div>

      <Card title="Historial del pedido" description="Todo lo que ha pasado con este pedido, del más antiguo al más reciente.">
        {order.timeline.length === 0 && <EmptyState title="Todavía no hay movimientos en este pedido." />}
        <ol className="relative space-y-4 border-l border-border pl-5 text-sm empty:hidden">
          {order.timeline.map((event) => (
            <li key={event.id} className="relative">
              <span aria-hidden="true" className={`absolute top-1.5 -left-[1.6875rem] size-2.5 rounded-full border-2 border-[#fffdf9] ${event.failed ? "bg-danger" : "bg-fg/40"}`} />
              <p className={event.failed ? "font-medium text-danger" : "font-medium"}>{EVENT_LABELS[event.type] ?? "Actualización del pedido"}</p>
              <p className="mt-0.5 text-xs text-muted">{when(event.at)}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
