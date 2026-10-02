import { clientIp, getShippingDeps, handle, toResponse } from "@/server/presale/runtime";
import { quoteShipping } from "@/server/presale/shipping";

const MAX_BODY_BYTES = 4_000;

/** Cotiza el envío a domicilio con SkyDropX (ver ShippingQuoteRequest / ShippingQuoteResponse en contract.ts). */
export async function POST(request: Request, ctx: RouteContext<"/api/preventa/[slug]/envio">) {
  return handle("presale_shipping_quote", async () => {
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
    return toResponse(await quoteShipping(getShippingDeps(), { slug, body, clientIp: clientIp(request) }));
  });
}
