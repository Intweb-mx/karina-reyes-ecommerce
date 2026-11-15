/*
 * Panel de la tienda: implementa el contrato de `src/lib/store/admin-contract.ts` (rutas /api/panel/tienda/*).
 * El backend decide qué acciones caben en cada estado (`allowedActions`); el panel solo muestra esas. Cada acción revisa
 * el estado en la base, así que repetirla (doble clic, reintento) no la aplica dos veces.
 */
import {
  addStoreOrderNote,
  adjustStock,
  applyStoreRefund,
  cancelStoreOrder,
  currentPrice,
  findStoreOrderById,
  findStoreOrderByNumber,
  getStoreDashboard,
  getStoreOrderException,
  getStoreProductById,
  getStoreSettings,
  InvalidStockAdjustmentError,
  isStoreOrderCancelled,
  listStockMovements,
  listStoreOrderEvents,
  listStoreOrderItems,
  listStoreOrderNotes,
  listStoreProducts,
  markStoreDelivered,
  markStoreReadyForPickup,
  reportStoreException,
  resolveStoreException,
  searchStoreOrders,
  StockBelowReservedError,
  STORE_NOT_SHIPPED_STATUSES,
  STORE_ORDER_FILTERS,
  updateStoreProductSettings,
  type Database,
  type StoreOrder,
  type StoreOrderEventType,
  type StoreOrderFilter,
  type StoreProductWithInventory,
} from "@inttimo/database";
import { z } from "zod";
import { getStoreProductContent } from "../../content/store-products.ts";
import type {
  AdminDashboard,
  AdminOrderAction,
  AdminOrderDetail,
  AdminOrderEvent,
  AdminOrdersResponse,
  AdminPeriod,
  AdminProduct,
  AdminProductsResponse,
  StockMovementsResponse,
} from "../../lib/store/admin-contract.ts";
import type { Money, ProductImage } from "../../lib/store/contract.ts";
import type { PaymentGateway } from "../presale/gateway.ts";
import type { MailSender } from "../presale/notifications.ts";
import type { ShippingProvider } from "../shipping/provider.ts";
import { productStatus } from "./catalog.ts";
import { fail, ok, redactError, zodFieldErrors, type StoreResult } from "./common.ts";
import { generateStoreLabel, handStoreOrderToCarrier } from "./fulfillment.ts";
import { resendStoreConfirmation, sendStoreOrderMail, storeCancelledMail, storeReadyForPickupMail, type StoreMailOutcome } from "./notifications.ts";
import { buildOrderView } from "./order-view.ts";

export type StoreAdminDeps = { db: Database; gateway: PaymentGateway; shipping: ShippingProvider | null; send: MailSender; now?: () => Date };
/** Quién ejecuta la acción y cómo dejarla en la bitácora del panel. */
export type StoreAdminActor = { email: string; audit: (entry: { action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> }) => Promise<void> };

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 5000;
const money = (amount: number, currency: string): Money => ({ amount, currency });
const isPaid = (order: StoreOrder) => order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded";
const notFound = () => fail(404, "not_found", "Pedido no encontrado.");
const conflict = (message: string) => fail(409, "validation_error", message);

// ---------- Resumen ----------

const PERIOD_DAYS: Record<AdminPeriod, number | null> = { "7d": 7, "30d": 30, all: null };

/** GET /api/panel/tienda/resumen */
export async function getAdminDashboard(deps: Pick<StoreAdminDeps, "db" | "now">, period: string | null): Promise<StoreResult<AdminDashboard>> {
  const safe: AdminPeriod = period === "7d" || period === "all" ? period : "30d";
  const days = PERIOD_DAYS[safe];
  const now = deps.now?.() ?? new Date();
  const data = await getStoreDashboard(deps.db, days === null ? null : new Date(now.getTime() - days * 86_400_000));
  return ok({
    period: safe,
    sales: money(data.sales, data.currency),
    orders: data.orders,
    averageTicket: data.orders ? money(Math.round(data.sales / data.orders), data.currency) : null,
    toShip: data.toShip,
    toPickup: data.toPickup,
    exceptions: data.exceptions,
    lowStock: data.lowStock,
    // Contacto e iglesias aún no tienen backend (docs/store/BACKEND-PLAN.md, subproyecto 7).
    newLeads: 0,
    topProducts: data.topProducts,
  });
}

// ---------- Pedidos ----------

export function parseOrdersQuery(params: URLSearchParams): { filter: StoreOrderFilter; search?: string; page: number } {
  const filter = params.get("filtro");
  const page = Number.parseInt(params.get("pagina") ?? "1", 10);
  return {
    filter: (STORE_ORDER_FILTERS as readonly string[]).includes(filter ?? "") ? (filter as StoreOrderFilter) : "all",
    search: params.get("q")?.trim().slice(0, 100) || undefined,
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** GET /api/panel/tienda/pedidos */
export async function listAdminOrders(deps: Pick<StoreAdminDeps, "db">, query: ReturnType<typeof parseOrdersQuery>): Promise<StoreResult<AdminOrdersResponse>> {
  const result = await searchStoreOrders(deps.db, { ...query, pageSize: PAGE_SIZE });
  return ok({
    orders: result.rows.map((order) => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      customerName: order.fullName,
      email: order.email,
      units: order.units,
      total: money(order.totalAmount, order.currency),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryMethod: order.deliveryMethod,
      waitingSince: order.waiting ? (order.paidAt ?? order.createdAt).toISOString() : null,
    })),
    total: result.total,
    pageSize: result.pageSize,
    counts: result.counts,
  });
}

const PAYMENT_CSV: Record<StoreOrder["paymentStatus"], string> = { pending: "Sin pagar", authorized: "Autorizado", paid: "Pagado", failed: "Rechazado", cancelled: "Cancelado", refunded: "Reembolsado", partially_refunded: "Reembolso parcial" };
const DELIVERY_CSV: Record<StoreOrder["deliveryMethod"], string> = { shipping: "Envío a domicilio", pickup: "Recolección", digital: "Descarga digital" };
const FULFILLMENT_CSV: Record<StoreOrder["fulfillmentStatus"], string> = {
  confirmed: "Por preparar",
  preparing: "En preparación",
  label_generated: "Guía lista",
  ready_for_pickup: "Listo para recoger",
  handed_to_carrier: "Con la paquetería",
  in_transit: "En tránsito",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  exception: "Incidencia",
};

/** Celda de CSV: comillas dobles y sin fórmulas (una celda que empieza con = + - @ no se ejecuta en Excel). */
const cell = (value: string | number | null) => {
  const text = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

/** GET /api/panel/tienda/pedidos/exportar — CSV en UTF-8 con BOM (Excel muestra bien los acentos). */
export async function exportAdminOrders(deps: Pick<StoreAdminDeps, "db">, query: ReturnType<typeof parseOrdersQuery>): Promise<{ csv: string; rows: number }> {
  const { rows } = await searchStoreOrders(deps.db, { filter: query.filter, search: query.search, pageSize: EXPORT_LIMIT });
  const date = (value: Date | null) => (value ? value.toLocaleString("sv-SE", { timeZone: "America/Mexico_City" }) : "");
  const address = (order: StoreOrder) => {
    const a = order.deliveryAddress;
    return a ? [a.street, a.neighborhood, `${a.postalCode} ${a.city}`, a.state].join(", ") : "";
  };
  const lines = [
    ["Folio", "Fecha del pedido", "Fecha de pago", "Cliente", "Correo", "Teléfono", "Piezas", "Subtotal", "Envío", "Total", "Reembolsado", "Pago", "Entrega", "Estado", "Paquetería", "Guía", "Dirección"],
    ...rows.map((order) => [
      order.orderNumber,
      date(order.createdAt),
      date(order.paidAt),
      order.fullName,
      order.email,
      order.phone,
      order.units,
      (order.subtotalAmount / 100).toFixed(2),
      (order.shippingAmount / 100).toFixed(2),
      (order.totalAmount / 100).toFixed(2),
      (order.amountRefunded / 100).toFixed(2),
      PAYMENT_CSV[order.paymentStatus],
      DELIVERY_CSV[order.deliveryMethod],
      isPaid(order) ? FULFILLMENT_CSV[order.fulfillmentStatus] : "",
      order.carrier,
      order.trackingNumber,
      address(order),
    ]),
  ];
  return { csv: `﻿${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`, rows: rows.length };
}

const EVENT_LABELS: Record<StoreOrderEventType, string> = {
  ORDER_CREATED: "Pedido creado",
  CHECKOUT_CREATED: "El cliente pasó a pagar",
  CHECKOUT_CREATE_FAILED: "No se pudo abrir la página de pago",
  CHECKOUT_EXPIRED: "El cliente no terminó de pagar",
  PAYMENT_APPROVED: "Pago recibido",
  PAYMENT_FAILED: "Pago rechazado",
  INVENTORY_RESERVED: "Piezas apartadas",
  INVENTORY_COMMITTED: "Piezas descontadas del inventario",
  INVENTORY_RELEASED: "Piezas apartadas liberadas",
  SHIPPING_QUOTED: "Envío cotizado",
  SHIPMENT_CREATED: "Envío creado en SkyDropX",
  LABEL_GENERATED: "Guía generada",
  LABEL_FAILED: "No se pudo generar la guía",
  READY_FOR_PICKUP: "Listo para recoger",
  HANDED_TO_CARRIER: "Entregado a la paquetería",
  IN_TRANSIT: "En tránsito",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregado",
  CONFIRMATION_EMAIL_SENT: "Correo de confirmación enviado",
  CONFIRMATION_EMAIL_FAILED: "Falló el correo de confirmación",
  FULFILLMENT_EMAIL_SENT: "Correo de aviso enviado al cliente",
  FULFILLMENT_EMAIL_FAILED: "Falló el correo de aviso al cliente",
  DOWNLOAD_LINK_ISSUED: "Enlace de descarga enviado",
  DOWNLOAD_USED: "El cliente descargó su archivo",
  CANCELLED: "Pedido cancelado",
  REFUND_REQUESTED: "Reembolso solicitado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
  EXCEPTION: "Incidencia",
  EXCEPTION_RESOLVED: "Incidencia resuelta",
};

const EXCEPTION_LABELS: Record<string, string> = {
  reported: "Incidencia reportada por el equipo",
  oversold_after_release: "Incidencia: el pago llegó cuando ya no había existencias",
  amount_mismatch: "Incidencia: Stripe cobró un monto distinto al del pedido",
};

function timelineOf(events: Awaited<ReturnType<typeof listStoreOrderEvents>>): AdminOrderEvent[] {
  return events.map((event) => {
    const metadata = (event.metadata ?? {}) as Record<string, unknown>;
    const reason = typeof metadata.reason === "string" ? metadata.reason : "";
    return {
      at: event.createdAt.toISOString(),
      type: event.type,
      label: (event.type === "EXCEPTION" && EXCEPTION_LABELS[reason]) || EVENT_LABELS[event.type] || "Actualización del pedido",
      actor: event.actor,
      note: typeof metadata.note === "string" && metadata.note ? metadata.note : null,
    };
  });
}

const SHIPPED = ["handed_to_carrier", "in_transit", "out_for_delivery"];

/** Acciones que caben en el estado actual. El orden es el que muestra el panel: primero el siguiente paso. */
export function allowedActionsFor(order: StoreOrder, extra: { cancelled: boolean; exception: Awaited<ReturnType<typeof getStoreOrderException>> }): AdminOrderAction[] {
  if (extra.cancelled) return [];
  const status = order.fulfillmentStatus;
  if (!isPaid(order)) {
    // Sin pagar se puede cerrar; reembolsado desde Stripe y sin haber salido, falta cancelarlo para devolver las piezas.
    if (order.paymentStatus === "pending" || order.paymentStatus === "authorized") return ["cancel"];
    const before = status === "exception" ? (extra.exception?.previousStatus ?? "confirmed") : status;
    return order.paymentStatus === "refunded" && order.deliveryMethod !== "digital" && !SHIPPED.includes(before) && before !== "delivered" ? ["cancel"] : [];
  }
  if (status === "exception") {
    const reported = extra.exception?.reason === "reported" && !!extra.exception.previousStatus;
    const left = reported && (SHIPPED.includes(extra.exception!.previousStatus!) || extra.exception!.previousStatus === "delivered");
    return [...(reported ? (["resolve_exception"] as const) : []), ...(left ? [] : (["cancel"] as const))];
  }
  if (order.deliveryMethod === "digital") return ["resend_confirmation"];

  const actions: AdminOrderAction[] = [];
  const notShipped = (STORE_NOT_SHIPPED_STATUSES as readonly string[]).includes(status);
  if (order.deliveryMethod === "shipping") {
    if (notShipped && !order.trackingNumber) actions.push("generate_label");
    if (notShipped && order.trackingNumber) actions.push("mark_shipped");
    if (SHIPPED.includes(status)) actions.push("mark_delivered");
    if (notShipped && !order.trackingNumber) actions.push("register_shipment");
  } else {
    if (status === "confirmed" || status === "preparing") actions.push("mark_ready_for_pickup");
    if (status === "ready_for_pickup") actions.push("mark_delivered");
  }
  if (status !== "delivered") actions.push("report_exception");
  actions.push("resend_confirmation");
  if (notShipped || status === "ready_for_pickup") actions.push("cancel");
  return actions;
}

async function detailOf(db: Database, order: StoreOrder, notice?: AdminOrderDetail["notice"]): Promise<AdminOrderDetail> {
  const [view, events, notes, cancelled, exception] = [
    await buildOrderView(db, order),
    await listStoreOrderEvents(db, order.id),
    await listStoreOrderNotes(db, order.id),
    await isStoreOrderCancelled(db, order.id),
    order.fulfillmentStatus === "exception" ? await getStoreOrderException(db, order.id) : null,
  ];
  return {
    ...view,
    // En el panel el correo va completo (la vista pública lo enmascara).
    email: order.email,
    customerName: order.fullName,
    phone: order.phone ?? order.deliveryAddress?.phone ?? null,
    marketingConsent: order.marketingConsent,
    labelUrl: order.labelUrl,
    allowedActions: allowedActionsFor(order, { cancelled, exception }),
    notes: notes.map((note) => ({ at: note.createdAt.toISOString(), author: note.authorEmail, text: note.body })),
    timeline: timelineOf(events),
    ...(notice ? { notice } : {}),
  };
}

const ORDER_NUMBER = /^INT-[0-9A-Z]{10}$/;
const findOrder = (db: Database, orderNumber: string) => (ORDER_NUMBER.test(orderNumber) ? findStoreOrderByNumber(db, orderNumber) : Promise.resolve(null));

/** GET /api/panel/tienda/pedidos/[folio]. Consultar datos personales queda en la bitácora. */
export async function getAdminOrder(deps: Pick<StoreAdminDeps, "db">, orderNumber: string, actor: StoreAdminActor): Promise<StoreResult<AdminOrderDetail>> {
  const order = await findOrder(deps.db, orderNumber);
  if (!order) return notFound();
  await actor.audit({ action: "store_order.view", targetType: "store_order", targetId: order.id });
  return ok(await detailOf(deps.db, order));
}

const noteSchema = z.object({ text: z.string({ error: "Escribe la nota." }).trim().min(1, "Escribe la nota.").max(2000, "La nota es demasiado larga (máximo 2000 caracteres).") });

/** POST /api/panel/tienda/pedidos/[folio]/notas */
export async function addAdminOrderNote(deps: Pick<StoreAdminDeps, "db">, orderNumber: string, body: unknown, actor: StoreAdminActor): Promise<StoreResult<AdminOrderDetail>> {
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", parsed.error.issues[0]?.message ?? "Revisa la nota.", zodFieldErrors(parsed.error));
  const order = await findOrder(deps.db, orderNumber);
  if (!order) return notFound();
  await addStoreOrderNote(deps.db, { orderId: order.id, body: parsed.data.text, authorEmail: actor.email });
  await actor.audit({ action: "store_order.note", targetType: "store_order", targetId: order.id });
  return ok(await detailOf(deps.db, order));
}

const optionalNote = z
  .string()
  .trim()
  .max(1000, "La nota es demasiado larga (máximo 1000 caracteres).")
  .optional()
  .transform((value) => value || null);

const actionSchema = z.object({
  action: z.enum(["generate_label", "mark_ready_for_pickup", "mark_shipped", "mark_delivered", "report_exception", "resend_confirmation", "cancel", "register_shipment", "resolve_exception"]),
  note: optionalNote,
  shipment: z
    .object({
      carrier: z.string({ error: "Indica la paquetería." }).trim().min(1, "Indica la paquetería.").max(80),
      trackingNumber: z.string({ error: "Indica el número de guía." }).trim().min(1, "Indica el número de guía.").max(80),
      trackingUrl: z
        .string()
        .trim()
        .max(500)
        .optional()
        .transform((value) => value || null)
        .pipe(z.url({ protocol: /^https$/, error: "La liga de rastreo debe empezar con https://." }).nullable()),
    })
    .optional(),
});

const MAIL_NOTE: Record<StoreMailOutcome, string> = { sent: "Se avisó al cliente por correo.", failed: "No se pudo enviar el correo al cliente (quedó en el historial): avísale por otro medio." };

/**
 * POST /api/panel/tienda/pedidos/[folio]/acciones. Devuelve el pedido actualizado y, en `notice`, lo que pasó (incluido
 * si el correo al cliente no salió: nunca se reporta como éxito algo que falló).
 */
export async function runAdminOrderAction(deps: StoreAdminDeps, orderNumber: string, body: unknown, actor: StoreAdminActor): Promise<StoreResult<AdminOrderDetail>> {
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", parsed.error.issues[0]?.message ?? "Acción no válida.", zodFieldErrors(parsed.error));
  const { action, note, shipment } = parsed.data;
  const order = await findOrder(deps.db, orderNumber);
  if (!order) return notFound();

  const cancelled = await isStoreOrderCancelled(deps.db, order.id);
  const exception = order.fulfillmentStatus === "exception" ? await getStoreOrderException(deps.db, order.id) : null;
  if (!allowedActionsFor(order, { cancelled, exception }).includes(action)) return conflict("Esa acción ya no está disponible para este pedido. Recarga la página.");

  const ctx = { source: "panel" as const, actor: actor.email };
  const stale = () => conflict("El pedido ya cambió de estado. Recarga la página.");
  const done = async (text: string, tone: "ok" | "error" = "ok", metadata: Record<string, unknown> = {}) => {
    await actor.audit({ action: `store_order.${action}`, targetType: "store_order", targetId: order.id, metadata });
    return ok(await detailOf(deps.db, (await findStoreOrderById(deps.db, order.id))!, { tone, text }));
  };
  const withMail = (text: string, email: StoreMailOutcome) => done(`${text} ${MAIL_NOTE[email]}`, email === "failed" ? "error" : "ok", { email });

  switch (action) {
    case "generate_label": {
      const result = await generateStoreLabel({ db: deps.db, provider: deps.shipping, now: deps.now }, order.id, actor.email);
      if (!result.ok) {
        await actor.audit({ action: "store_order.generate_label", targetType: "store_order", targetId: order.id, metadata: { error: result.error.slice(0, 300) } });
        return fail(502, "service_unavailable", result.error);
      }
      return done(result.message, "ok", { status: result.status });
    }
    case "mark_shipped":
    case "register_shipment": {
      if (action === "register_shipment" && !shipment) return fail(400, "validation_error", "Indica la paquetería y el número de guía.");
      const result = await handStoreOrderToCarrier(deps, order.id, action === "register_shipment" ? { carrier: shipment!.carrier, trackingNumber: shipment!.trackingNumber, trackingUrl: shipment!.trackingUrl } : null, ctx);
      if (!result.ok) return conflict(result.error);
      return withMail("Pedido marcado como enviado.", result.email);
    }
    case "mark_ready_for_pickup": {
      const updated = await markStoreReadyForPickup(deps.db, order.id, ctx);
      if (!updated) return stale();
      const items = await listStoreOrderItems(deps.db, updated.id);
      const point = (await getStoreSettings(deps.db))?.pickupPoints.find((candidate) => candidate.id === updated.pickupPointId);
      return withMail("Pedido listo para recoger.", await sendStoreOrderMail(deps.db, deps.send, updated, storeReadyForPickupMail(updated, items, point), "ready_for_pickup"));
    }
    case "mark_delivered":
      return (await markStoreDelivered(deps.db, order.id, ctx)) ? done("Pedido marcado como entregado.") : stale();
    case "report_exception":
      return (await reportStoreException(deps.db, order.id, note, ctx)) ? done("Incidencia registrada. El pedido queda en pausa hasta resolverla o cancelarlo.") : stale();
    case "resolve_exception":
      return (await resolveStoreException(deps.db, order.id, note, ctx)) ? done("Incidencia resuelta: el pedido vuelve a donde estaba.") : stale();
    case "resend_confirmation": {
      const email = await resendStoreConfirmation(deps.db, deps.send, order);
      return done(email === "sent" ? "Correo de confirmación reenviado." : "No se pudo enviar el correo (quedó en el historial). Inténtalo más tarde.", email === "sent" ? "ok" : "error", { email });
    }
    case "cancel":
      return cancelOrder(deps, order, note, actor, done);
  }
}

/**
 * Cancelar: 1) si hay un cobro, se reembolsa completo en Stripe (con clave de idempotencia por pedido: un reintento nunca
 * reembolsa dos veces); 2) se registra el reembolso; 3) se cierra el pedido devolviendo las piezas al inventario. Si Stripe
 * falla no cambia nada. Si falla un paso posterior, repetir "Cancelar" retoma donde se quedó.
 */
async function cancelOrder(
  deps: StoreAdminDeps,
  order: StoreOrder,
  note: string | null,
  actor: StoreAdminActor,
  done: (text: string, tone?: "ok" | "error", metadata?: Record<string, unknown>) => Promise<StoreResult<AdminOrderDetail>>,
): Promise<StoreResult<AdminOrderDetail>> {
  const paid = isPaid(order);
  // Un pedido pendiente con cobro registrado es un cobro con monto distinto: también se devuelve lo cobrado.
  const charged = paid || (order.paymentStatus === "pending" && order.fulfillmentStatus === "exception" && !!order.stripePaymentIntentId);
  let refunded = false;
  if (charged) {
    if (!order.stripePaymentIntentId) return conflict("Este pedido no tiene un pago de Stripe ligado: reembólsalo desde Stripe y vuelve a cancelar.");
    try {
      await deps.gateway.refundPayment({ paymentIntentId: order.stripePaymentIntentId, idempotencyKey: `store-cancel-${order.id}` });
      refunded = true;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", msg: "store_cancel_refund_failed", orderId: order.id, error: redactError(error) }));
      await actor.audit({ action: "store_order.cancel", targetType: "store_order", targetId: order.id, metadata: { error: "refund_failed" } });
      return fail(502, "service_unavailable", "Stripe no pudo hacer el reembolso, así que el pedido NO se canceló. Inténtalo de nuevo o reembolsa desde Stripe.");
    }
    if (paid) await applyStoreRefund(deps.db, order.id, order.totalAmount, { source: "panel" });
  } else if (order.stripeCheckoutSessionId && order.paymentStatus === "pending") {
    // Cierra la página de pago abierta para que el cliente ya no pueda pagar un pedido cancelado.
    await deps.gateway.expireCheckout(order.stripeCheckoutSessionId).catch((error: unknown) => {
      console.warn(JSON.stringify({ level: "warn", msg: "store_cancel_expire_failed", orderId: order.id, error: redactError(error) }));
    });
  }

  const result = await cancelStoreOrder(deps.db, order.id, { source: "panel", actor: actor.email, note });
  if ("error" in result) return conflict(result.error === "shipped" ? "El pedido ya salió con la paquetería: la devolución se atiende aparte." : "El pedido ya cambió de estado. Recarga la página.");

  const parts = ["Pedido cancelado."];
  if (refunded) parts.push(`Se reembolsó el pago en Stripe.`);
  if (result.restocked) parts.push("Las piezas volvieron al inventario.");
  if (order.shipmentId) parts.push("OJO: la guía ya estaba comprada; cancélala en SkyDropX para recuperar el saldo.");
  let email: StoreMailOutcome | "skipped" = "skipped";
  // Solo se avisa al cliente de un pedido que sí había pagado (un carrito abandonado no recibe correo).
  if (result.changed && (paid || order.paymentStatus === "refunded")) {
    email = await sendStoreOrderMail(deps.db, deps.send, result.order, storeCancelledMail(order, refunded), "cancelled");
    parts.push(MAIL_NOTE[email]);
  }
  return done(parts.join(" "), email === "failed" ? "error" : "ok", { refunded, restocked: result.restocked, email });
}

// ---------- Productos e inventario ----------

/** Imagen de respaldo para un producto que aún no tiene contenido (no se vende hasta tenerlo). */
const fallbackImage = (): ProductImage => ({ ...(getStoreProductContent("uno-mas-uno")?.image ?? { src: "/icon.png", width: 512, height: 512 }), alt: "" });

function toAdminProduct(product: StoreProductWithInventory, byId: Map<string, StoreProductWithInventory>, now: Date): AdminProduct {
  const digital = product.type === "digital";
  const { price } = currentPrice(product, now);
  const available = digital ? (product.digitalFileKey ? product.maxQuantityPerOrder : 0) : Math.max(0, product.available);
  const base = product.stockProductId ? byId.get(product.stockProductId) : undefined;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    status: productStatus({ saleStatus: product.saleStatus, effectiveAvailable: available, lowStockThreshold: product.lowStockThreshold, type: product.type }),
    published: product.published,
    price: price === null ? null : money(price, product.currency),
    image: getStoreProductContent(product.slug)?.image ?? fallbackImage(),
    maxQuantityPerOrder: product.maxQuantityPerOrder,
    type: product.type,
    bundleOf: base ? { name: base.name, units: product.stockUnits } : null,
    inventory: digital ? { onHand: 0, reserved: 0, available, lowStockThreshold: 0 } : { onHand: product.onHand, reserved: product.reserved, available, lowStockThreshold: product.lowStockThreshold },
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** GET /api/panel/tienda/productos */
export async function listAdminProducts(deps: Pick<StoreAdminDeps, "db" | "now">): Promise<StoreResult<AdminProductsResponse>> {
  const products = await listStoreProducts(deps.db);
  const byId = new Map(products.map((product) => [product.id, product]));
  const now = deps.now?.() ?? new Date();
  return ok({ products: products.map((product) => toAdminProduct(product, byId, now)) });
}

async function adminProduct(deps: Pick<StoreAdminDeps, "db" | "now">, id: string): Promise<AdminProduct | null> {
  const product = await getStoreProductById(deps.db, id);
  if (!product) return null;
  const base = product.stockProductId ? await getStoreProductById(deps.db, product.stockProductId) : null;
  return toAdminProduct(product, new Map(base ? [[base.id, base]] : []), deps.now?.() ?? new Date());
}

const uuid = z.uuid();
const productNotFound = () => fail(404, "not_found", "Producto no encontrado.");

const productPatchSchema = z
  .object({
    price: z.number({ error: "Escribe un precio válido." }).int("Escribe un precio válido.").min(100, "El precio mínimo es $1.00.").max(10_000_000, "El precio es demasiado alto."),
    published: z.boolean(),
    lowStockThreshold: z.number().int().min(0, "El aviso de poco inventario no puede ser negativo.").max(100_000),
    maxQuantityPerOrder: z.number().int().min(1, "El máximo por pedido debe ser al menos 1.").max(100, "El máximo por pedido no puede pasar de 100."),
  })
  .partial()
  .strict();

/** PATCH /api/panel/tienda/productos/[id]. Precio y publicación quedan en la bitácora con su valor anterior. */
export async function updateAdminProduct(deps: Pick<StoreAdminDeps, "db" | "now">, id: string, body: unknown, actor: StoreAdminActor): Promise<StoreResult<AdminProduct>> {
  if (!uuid.safeParse(id).success) return productNotFound();
  const parsed = productPatchSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", parsed.error.issues[0]?.message ?? "Revisa los datos.", zodFieldErrors(parsed.error));
  const now = deps.now?.() ?? new Date();
  const current = await getStoreProductById(deps.db, id);
  if (!current) return productNotFound();
  if (parsed.data.published === true && currentPrice(current, now).price === null && parsed.data.price === undefined) return conflict("Ponle precio al producto antes de publicarlo.");

  const result = await updateStoreProductSettings(deps.db, id, parsed.data, now);
  if (!result) return productNotFound();
  const { before, after } = result;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of ["price", "compareAtPrice", "published", "lowStockThreshold", "maxQuantityPerOrder"] as const) {
    if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] };
  }
  if (Object.keys(changes).length) await actor.audit({ action: "store_product.update", targetType: "store_product", targetId: id, metadata: { slug: after.slug, changes } });
  return ok((await adminProduct(deps, id))!);
}

const stockSchema = z.object({
  delta: z.number({ error: "Escribe cuántas piezas." }).int("Escribe un número entero de piezas.").min(-100_000).max(100_000),
  reason: z.enum(["reception", "adjustment", "damage", "return", "correction"], { error: "Elige el motivo." }),
  note: z
    .string()
    .trim()
    .max(300, "La nota es demasiado larga (máximo 300 caracteres).")
    .optional()
    .transform((value) => value || null),
});

/** POST /api/panel/tienda/productos/[id]/inventario — siempre un movimiento con motivo y autor; nunca se sobrescribe el número. */
export async function adjustAdminStock(deps: Pick<StoreAdminDeps, "db" | "now">, id: string, body: unknown, actor: StoreAdminActor): Promise<StoreResult<AdminProduct>> {
  if (!uuid.safeParse(id).success) return productNotFound();
  const parsed = stockSchema.safeParse(body);
  if (!parsed.success) return fail(400, "validation_error", parsed.error.issues[0]?.message ?? "Revisa los datos.", zodFieldErrors(parsed.error));
  const product = await getStoreProductById(deps.db, id);
  if (!product) return productNotFound();
  if (product.type === "digital") return conflict("Un producto digital no lleva inventario.");
  try {
    await adjustStock(deps.db, { productId: id, delta: parsed.data.delta, reason: parsed.data.reason, actor: actor.email, note: parsed.data.note });
  } catch (error) {
    if (error instanceof InvalidStockAdjustmentError || error instanceof StockBelowReservedError) return conflict(error.message);
    throw error;
  }
  await actor.audit({ action: "store_product.stock", targetType: "store_product", targetId: id, metadata: { slug: product.slug, delta: parsed.data.delta, reason: parsed.data.reason } });
  return ok((await adminProduct(deps, id))!);
}

/** GET /api/panel/tienda/productos/[id]/movimientos — de un paquete se muestran los de su producto base. */
export async function listAdminStockMovements(deps: Pick<StoreAdminDeps, "db">, id: string): Promise<StoreResult<StockMovementsResponse>> {
  if (!uuid.safeParse(id).success) return productNotFound();
  const product = await getStoreProductById(deps.db, id);
  if (!product) return productNotFound();
  const movements = await listStockMovements(deps.db, product.stockProductId ?? product.id);
  return ok({ movements: movements.map((m) => ({ id: m.id, at: m.createdAt.toISOString(), deltaOnHand: m.deltaOnHand, deltaReserved: m.deltaReserved, reason: m.reason, actor: m.actor, orderNumber: m.orderNumber, note: m.note })) });
}
