import { createPresaleReservation } from "@/server/presale/reservations";
import { clientIp, getPresaleDeps, handle, toResponse } from "@/server/presale/runtime";

const MAX_BODY_BYTES = 32_000;

export async function POST(request: Request, ctx: RouteContext<"/api/preventa/[slug]/reservas">) {
  return handle("presale_reservation", async () => {
    const { slug } = await ctx.params;
    const raw = await request.text();
    let body: unknown = null;
    if (raw.length <= MAX_BODY_BYTES) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }
    const result = await createPresaleReservation(getPresaleDeps(), {
      slug,
      body,
      idempotencyKey: request.headers.get("idempotency-key"),
      clientIp: clientIp(request),
    });
    return toResponse(result);
  });
}
