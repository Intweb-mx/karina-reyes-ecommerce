import { grantBonusPdf } from "@/server/presale/bonus";
import { getDb, getPrivateStorage, handle } from "@/server/presale/runtime";

/** Descarga del PDF: valida el enlace personal y redirige a una URL temporal. La liga real del archivo no se expone. */
export async function GET(_request: Request, ctx: RouteContext<"/bonus/[token]/pdf">) {
  return handle("bonus_pdf", async () => {
    const { token } = await ctx.params;
    const grant = await grantBonusPdf({ db: getDb(), storage: getPrivateStorage() }, token);
    if (grant.status === "ok") return new Response(null, { status: 302, headers: { location: grant.url, "cache-control": "no-store" } });
    // Enlace inválido o sin archivo: se vuelve a la página del bonus, que explica qué pasó.
    return new Response(null, { status: 303, headers: { location: `/bonus/${encodeURIComponent((await ctx.params).token)}`, "cache-control": "no-store" } });
  });
}
