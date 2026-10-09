import "server-only";
import {
  findReservationById,
  getCampaignById,
  getPostPurchaseAnswers,
  getTermsById,
  listCampaigns,
  listOrderNotes,
  listReservationEvents,
  searchAllReservations,
  type Database,
  type PresaleReservation,
} from "@inttimo/database";
import { postPurchaseCopy } from "@/content/presale";
import { ORDER_TABS, type AnswerRow, type OrderDetail, type OrderList, type OrderQuery, type OrderSummary, type OrderTab } from "./contract.ts";
import { incidentsFor } from "./incidents.ts";
import { nextStepFor } from "./next-step.ts";

export const ORDERS_PAGE_SIZE = 50;

export function toOrderSummary(r: PresaleReservation, campaignNames: Map<string, string>): OrderSummary {
  return {
    id: r.id,
    code: r.code,
    fullName: r.fullName,
    email: r.email,
    quantity: r.quantity,
    totalAmount: r.totalAmount,
    currency: r.currency,
    status: r.status,
    deliveryMethod: r.deliveryMethod,
    fulfillmentStatus: r.fulfillmentStatus,
    campaignName: campaignNames.get(r.campaignId) ?? "",
    createdAt: r.createdAt,
    paidAt: r.paidAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Filtros de la lista de pedidos a partir de la URL (?tab, q, entrega, campana, pagina). Lo inválido se descarta. */
export function parseOrderQuery(params: Record<string, string | string[] | undefined>): OrderQuery {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const tab = one("tab");
  const entrega = one("entrega");
  const campana = one("campana");
  const q = one("q")?.trim().slice(0, 100);
  const validTab = tab && (ORDER_TABS as readonly string[]).includes(tab) ? (tab as OrderTab) : null;
  // Buscar sin pestaña explícita recorre todos los pedidos.
  const query: OrderQuery = { tab: validTab ?? (q ? "all" : "to_prepare"), page: parsePage(one("pagina")) };
  if (q) query.q = q;
  if (entrega === "shipping" || entrega === "pickup") query.deliveryMethod = entrega;
  if (campana && UUID.test(campana)) query.campaignId = campana;
  return query;
}

export async function searchOrders(db: Database, query: OrderQuery): Promise<OrderList> {
  const [campaigns, result] = await Promise.all([
    listCampaigns(db),
    searchAllReservations(db, {
      query: query.q,
      tab: query.tab,
      deliveryMethod: query.deliveryMethod,
      campaignId: query.campaignId,
      limit: ORDERS_PAGE_SIZE,
      offset: (query.page - 1) * ORDERS_PAGE_SIZE,
    }),
  ]);
  const names = new Map(campaigns.map((c) => [c.id, c.productName]));
  return {
    rows: result.rows.map((r) => toOrderSummary(r, names)),
    total: result.total,
    counts: result.counts,
    page: query.page,
    pages: Math.max(1, Math.ceil(result.total / ORDERS_PAGE_SIZE)),
    campaigns: campaigns.map((c) => ({ id: c.id, slug: c.slug, productName: c.productName })),
  };
}

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

function addressLines(r: PresaleReservation): string[] | null {
  const a = r.deliveryAddress;
  if (a) return [a.name, `${a.street}, ${a.neighborhood}`, ...(a.reference ? [`Referencias: ${a.reference}`] : []), `${a.postalCode} ${a.city}, ${a.state}`, `Tel. ${a.phone}`];
  const s = r.shippingAddress;
  if (s) return [s.name, s.line1, s.line2, [s.postalCode, s.city].filter(Boolean).join(" ") + (s.state ? `, ${s.state}` : "")].filter((line): line is string => !!line);
  return null;
}

export async function getOrderDetail(db: Database, id: string, now: Date = new Date()): Promise<OrderDetail | null> {
  if (!UUID.test(id)) return null;
  const r = await findReservationById(db, id);
  if (!r) return null;
  const [campaign, terms, events, postPurchase, notes] = await Promise.all([
    getCampaignById(db, r.campaignId),
    getTermsById(db, r.termsId),
    listReservationEvents(db, r.id),
    getPostPurchaseAnswers(db, r.id),
    listOrderNotes(db, r.id),
  ]);
  const point = campaign?.pickupPoints.find((p) => p.id === r.pickupPointId) ?? null;
  const selection = r.shippingSelection;
  const answered = postPurchase && (postPurchase.submittedAt || Object.keys(postPurchase.answers).length > 0);
  const postPurchaseRows: AnswerRow[] | null = answered
    ? postPurchaseCopy.questions.map((q) => ({ label: q.label, value: answerText(postPurchase.answers[q.id], "options" in q ? q.options : undefined) }))
    : null;

  return {
    id: r.id,
    code: r.code,
    campaign: campaign ? { slug: campaign.slug, productName: campaign.productName } : null,
    customer: { fullName: r.fullName, email: r.email, phone: r.phone, marketingConsent: r.marketingConsent },
    payment: {
      status: r.status,
      quantity: r.quantity,
      unitAmount: r.unitAmount,
      shippingAmount: r.shippingAmount,
      totalAmount: r.totalAmount,
      amountRefunded: r.amountRefunded,
      currency: r.currency,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      termsVersion: terms?.version ?? null,
      stripeUrl: r.stripePaymentIntentId ? stripePaymentUrl(r.stripePaymentIntentId) : null,
    },
    delivery: {
      method: r.deliveryMethod,
      status: r.fulfillmentStatus,
      pickupPoint: point ? { name: point.name, schedule: point.schedule } : null,
      address: addressLines(r),
      selection: selection ? `${selection.carrier} ${selection.service}${selection.days ? ` · ${selection.days} ${selection.days === 1 ? "día" : "días"}` : ""}` : null,
      carrier: r.carrier,
      trackingNumber: r.trackingNumber,
      trackingUrl: r.trackingUrl,
      labelUrl: r.labelUrl,
      fulfilledAt: r.fulfilledAt,
      deliveredAt: r.deliveredAt,
    },
    bonus: { configured: !!campaign?.bonus, sentAt: r.bonusSentAt },
    nextStep: nextStepFor(r),
    incidents: incidentsFor(r, events, now),
    answers: (campaign?.questions ?? []).map((q) => ({ label: q.label, value: answerText(r.answers[q.id], q.options) })),
    postPurchase: postPurchaseRows,
    notes: notes.map((n) => ({ id: n.id, body: n.body, authorEmail: n.authorEmail, createdAt: n.createdAt })),
    timeline: events.map((e) => ({ id: e.id, at: e.createdAt, type: e.type, failed: e.type.endsWith("_FAILED") })),
  };
}
