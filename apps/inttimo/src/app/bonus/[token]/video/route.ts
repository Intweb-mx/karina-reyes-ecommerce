import { grantBonusVideo } from "@/server/presale/bonus";
import { getDb, getPrivateStorage, handle } from "@/server/presale/runtime";

const NO_STORE = { "cache-control": "no-store" };

/** Pide una reproducción del video: devuelve una URL temporal y gasta una de las reproducciones del enlace. */
export async function POST(_request: Request, ctx: RouteContext<"/bonus/[token]/video">) {
  return handle("bonus_video", async () => {
    const { token } = await ctx.params;
    const grant = await grantBonusVideo({ db: getDb(), storage: getPrivateStorage() }, token);
    switch (grant.status) {
      case "ok":
        return Response.json({ url: grant.url, playsLeft: grant.playsLeft }, { headers: NO_STORE });
      case "exhausted":
        return Response.json({ error: { code: "plays_exhausted", message: "Ya usaste las reproducciones de este enlace." } }, { status: 403, headers: NO_STORE });
      case "expired":
        return Response.json({ error: { code: "link_expired", message: "Este enlace ya expiró." } }, { status: 410, headers: NO_STORE });
      default:
        return Response.json({ error: { code: "not_found", message: "Enlace no válido." } }, { status: 404, headers: NO_STORE });
    }
  });
}
