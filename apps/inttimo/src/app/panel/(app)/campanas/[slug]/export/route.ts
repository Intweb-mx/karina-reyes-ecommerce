import { getCampaignBySlug, listReservations, type ReservationStatus } from "@inttimo/database";
import type { NextRequest } from "next/server";
import { audit, getAdminState } from "@/server/auth/admin";
import { buildReservationsCsv } from "@/server/presale/export";
import { getDb } from "@/server/presale/runtime";
import { STATUS_LABELS } from "../../../../ui";

export async function GET(request: NextRequest, ctx: RouteContext<"/panel/campanas/[slug]/export">) {
  const state = await getAdminState();
  if (state.status !== "ok") return new Response("No autorizado", { status: 401 });

  const { slug } = await ctx.params;
  const db = getDb();
  const campaign = await getCampaignBySlug(db, slug);
  if (!campaign) return new Response("No encontrada", { status: 404 });

  const requested = request.nextUrl.searchParams.get("estado");
  const estado = requested && Object.hasOwn(STATUS_LABELS, requested) ? (requested as ReservationStatus) : null;
  const statuses = estado ? [estado] : undefined;
  const rows = await listReservations(db, campaign.id, statuses);
  // Descargar datos personales queda registrado.
  await audit(state.admin, { action: "reservations.export", targetType: "campaign", targetId: campaign.id, metadata: { rows: rows.length, estado: estado ?? "todos" } });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(buildReservationsCsv(campaign, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reservas-${slug}-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
