import { grantBonusVideo } from "@/server/presale/bonus";
import { getDb, getPrivateStorage, handle } from "@/server/presale/runtime";

const NO_STORE = { "cache-control": "no-store" };

/** Pide el video: devuelve una URL temporal (sin tope de reproducciones y sin vencimiento del enlace). */
export async function POST(_request: Request, ctx: RouteContext<"/bonus/[token]/video">) {
  return handle("bonus_video", async () => {
    const { token } = await ctx.params;
    const grant = await grantBonusVideo({ db: getDb(), storage: getPrivateStorage() }, token);
    switch (grant.status) {
      case "ok":
        return Response.json({ url: grant.url }, { headers: NO_STORE });
      default:
        return Response.json({ error: { code: "not_found", message: "Enlace no válido." } }, { status: 404, headers: NO_STORE });
    }
  });
}
