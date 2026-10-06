import "server-only";
import { listActionableReservations, listCampaigns, listEventsForReservations, type Database } from "@inttimo/database";
import type { Inbox } from "./contract.ts";
import { INCIDENT_EVENT_TYPES, incidentsFor } from "./incidents.ts";
import { nextStepFor } from "./next-step.ts";
import { toOrderSummary } from "./orders.ts";

const DAY_MS = 86_400_000;

/** Bandeja "Por hacer": lo que requiere acción en todas las preventas, del más antiguo al más nuevo. */
export async function getInbox(db: Database, now: Date = new Date()): Promise<Inbox> {
  const [reservations, campaigns] = await Promise.all([listActionableReservations(db), listCampaigns(db)]);
  const names = new Map(campaigns.map((c) => [c.id, c.productName]));
  const events = await listEventsForReservations(
    db,
    reservations.map((r) => r.id),
    INCIDENT_EVENT_TYPES,
  );
  const eventsById = new Map<string, typeof events>();
  for (const event of events) eventsById.set(event.reservationId, [...(eventsById.get(event.reservationId) ?? []), event]);

  const inbox: Inbox = { toLabel: [], toHandOver: [], toNotify: [], awaitingPickup: [], incidents: [] };
  const byPaid = [...reservations].sort((a, b) => (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime());
  for (const r of byPaid) {
    const summary = toOrderSummary(r, names);
    for (const incident of incidentsFor(r, eventsById.get(r.id) ?? [], now)) inbox.incidents.push({ ...summary, incident });
    const step = nextStepFor(r);
    if (step.type === "generate_label") inbox.toLabel.push(summary);
    else if (step.type === "hand_to_carrier") inbox.toHandOver.push(summary);
    else if (step.type === "notify_ready") inbox.toNotify.push(summary);
    else if (step.type === "mark_picked_up") {
      const since = r.fulfilledAt ?? r.paidAt ?? r.createdAt;
      inbox.awaitingPickup.push({ ...summary, waitingDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS)) });
    }
  }
  return inbox;
}
