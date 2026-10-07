import Image from "next/image";
import type { FulfillmentStatus, OrderView, PaymentStatus } from "@/lib/store/contract";
import { CheckIcon } from "@/components/ui/icons";
import { formatDate, formatMoney } from "@/lib/format";

export const FULFILLMENT_TEXT: Record<FulfillmentStatus, string> = {
  confirmed: "Pedido confirmado",
  preparing: "En preparación",
  label_generated: "Guía generada",
  ready_for_pickup: "Listo para recoger",
  handed_to_carrier: "Entregado a paquetería",
  in_transit: "En tránsito",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  exception: "Incidencia en la entrega",
};

export const PAYMENT_TEXT: Record<PaymentStatus, string> = {
  pending: "Pago pendiente",
  authorized: "Pago autorizado",
  paid: "Pagado",
  failed: "Pago no completado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
};

const SHIPPING_FLOW: FulfillmentStatus[] = ["confirmed", "preparing", "handed_to_carrier", "in_transit", "delivered"];
const PICKUP_FLOW: FulfillmentStatus[] = ["confirmed", "preparing", "ready_for_pickup", "delivered"];

/** Pasos del pedido (mockups 09 y 12). Solo se marcan como hechos los que reportó el sistema. */
export function OrderSteps({ order }: { order: OrderView }) {
  const flow = order.delivery.method === "pickup" ? PICKUP_FLOW : SHIPPING_FLOW;
  const rank = (status: FulfillmentStatus) => {
    const index = flow.indexOf(status === "label_generated" ? "preparing" : status === "out_for_delivery" ? "in_transit" : status);
    return index === -1 ? 0 : index;
  };
  const current = rank(order.fulfillmentStatus);
  const reached = (status: FulfillmentStatus) => order.events.find((event) => rank(event.status) === flow.indexOf(status));
  return (
    <ol aria-label="Estado del pedido" className="grid" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}>
      {flow.map((status, index) => {
        const done = index <= current;
        const event = reached(status);
        return (
          <li key={status} className="relative flex flex-col items-center text-center">
            {index > 0 && <span aria-hidden="true" className={`absolute top-3.5 right-1/2 left-[-50%] h-px ${index <= current ? "bg-success" : "bg-border"}`} />}
            <span aria-hidden="true" className={`relative z-10 grid size-7 place-items-center rounded-full border ${done ? "border-success bg-success text-on-ink" : "border-border bg-bg"} ${index === current && order.fulfillmentStatus !== "delivered" ? "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-success)_20%,transparent)]" : ""}`}>
              {done && <CheckIcon className="size-3.5" />}
            </span>
            <span className={`mt-2.5 text-[0.6875rem] leading-tight font-semibold sm:text-xs ${done ? "" : "text-muted"}`}>{FULFILLMENT_TEXT[status]}</span>
            <span className="mt-0.5 hidden text-[0.6875rem] text-muted sm:block">{event ? new Date(event.at).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" }) : done ? "" : "Próximamente"}</span>
            <span className="sr-only">{done ? "completado" : "pendiente"}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderLines({ order }: { order: OrderView }) {
  const money = (value: { amount: number; currency: string }) => formatMoney(value.amount, value.currency);
  return (
    <div>
      <ul className="space-y-4">
        {order.lines.map((line) => (
          <li key={line.name} className="flex gap-3">
            <span className="relative size-16 shrink-0 overflow-hidden bg-sand"><Image src={line.image.src} alt="" fill sizes="64px" className="object-cover" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{line.name}</span><span className="block text-xs text-muted">Cantidad: {line.quantity}</span></span>
            <span className="font-semibold lining-nums">{money(line.subtotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="lining-nums">{money(order.subtotal)}</dd></div>
        {order.discount && <div className="flex justify-between text-success"><dt>Descuento</dt><dd className="lining-nums">−{money(order.discount)}</dd></div>}
        <div className="flex justify-between"><dt className="text-muted">{order.delivery.method === "pickup" ? "Recolección" : "Envío"}</dt><dd className="lining-nums">{order.shipping.amount ? money(order.shipping) : "$0"}</dd></div>
        <div className="flex items-baseline justify-between border-t border-border pt-3"><dt className="font-semibold">Total</dt><dd className="font-serif text-3xl font-medium lining-nums">{money(order.total)}</dd></div>
      </dl>
    </div>
  );
}

export function OrderEvents({ order }: { order: OrderView }) {
  if (!order.events.length) return <p className="text-sm text-muted">Aún no hay movimientos de la paquetería. Te avisaremos por correo.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5 text-sm">
      {[...order.events].reverse().map((event) => (
        <li key={`${event.at}-${event.status}`} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.6875rem] size-2.5 rounded-full border-2 border-bg bg-success" />
          <p className="font-medium">{event.description}</p>
          <p className="text-xs text-muted">{formatDate(event.at)}{event.location ? ` · ${event.location}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}

export function DeliveryInfo({ order }: { order: OrderView }) {
  const { delivery, shipment } = order;
  return (
    <div className="space-y-2 text-sm">
      {delivery.method === "pickup" && delivery.pickupPoint ? (
        <>
          <p className="font-semibold">Recolección: {delivery.pickupPoint.name}</p>
          <p className="text-muted">{delivery.pickupPoint.schedule}</p>
        </>
      ) : delivery.address ? (
        <>
          <p className="font-semibold">{delivery.address.name}</p>
          <p className="text-muted">{delivery.address.line1}<br />{delivery.address.postalCode} {delivery.address.city}, {delivery.address.state}</p>
        </>
      ) : null}
      {shipment && (
        <p className="pt-2">
          <span className="font-semibold">{shipment.carrier}</span> · Guía <span className="font-mono">{shipment.trackingNumber}</span>
          {shipment.trackingUrl && <> · <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Seguir en el sitio de la paquetería</a></>}
          {shipment.eta && <span className="block text-muted">Entrega estimada: {formatDate(shipment.eta)}</span>}
        </p>
      )}
    </div>
  );
}
