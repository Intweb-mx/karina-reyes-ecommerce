import { getPublicCampaign } from "@/server/presale/reservations";
import { getDb, handle, toResponse } from "@/server/presale/runtime";

export async function GET(_request: Request, ctx: RouteContext<"/api/preventa/[slug]">) {
  return handle("presale_campaign", async () => {
    const { slug } = await ctx.params;
    return toResponse(await getPublicCampaign({ db: getDb() }, slug));
  });
}
