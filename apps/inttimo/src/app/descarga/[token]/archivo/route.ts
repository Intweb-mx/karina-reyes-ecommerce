import { getDb, getPrivateStorage, handle } from "@/server/presale/runtime";
import { grantDownload } from "@/server/store/downloads";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Botón "Descargar" (POST desde la página, nunca GET: un revisor de enlaces del correo no lo dispara). Gasta el enlace y
 * devuelve una URL firmada de corta vida; el navegador navega a ella con JavaScript (la CSP `form-action 'self'` bloquearía
 * la redirección de un formulario hacia el almacenamiento).
 */
export async function POST(_request: Request, ctx: RouteContext<"/descarga/[token]/archivo">) {
  return handle("store_download", async () => {
    const { token } = await ctx.params;
    const grant = await grantDownload({ db: getDb(), storage: getPrivateStorage() }, token);
    if (grant.status === "ok") return Response.json({ url: grant.url }, { headers: NO_STORE });
    return Response.json({ status: grant.status }, { status: 409, headers: NO_STORE });
  });
}
