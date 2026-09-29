import type { NextRequest } from "next/server";
import { getReservationStatus } from "@/server/presale/reservations";
import { getPresaleDeps, handle, toResponse } from "@/server/presale/runtime";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/preventa/[slug]/confirmacion">) {
  return handle("presale_status", async () => {
    const { slug } = await ctx.params;
    return toResponse(await getReservationStatus(getPresaleDeps(), { slug, sessionId: request.nextUrl.searchParams.get("session_id") }));
  });
}
