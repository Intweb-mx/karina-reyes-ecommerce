import { resendBonusByToken } from "@/server/presale/bonus";
import { getFulfillmentDeps, handle } from "@/server/presale/runtime";

const NO_STORE = { "cache-control": "no-store" };

/** El cliente pide un enlace nuevo desde su enlace vencido: sale al correo de la compra, nunca a uno que mande el navegador. */
export async function POST(_request: Request, ctx: RouteContext<"/bonus/[token]/reenviar">) {
  return handle("bonus_resend", async () => {
    const { token } = await ctx.params;
    const result = await resendBonusByToken(getFulfillmentDeps(), token);
    switch (result.status) {
      case "sent":
        return Response.json({ sent: true, emailHint: result.emailHint }, { headers: NO_STORE });
      case "too_soon":
        return Response.json({ error: { code: "too_soon", message: "Ya te mandamos un enlace hace unos minutos. Revisa tu bandeja de entrada y la carpeta de spam." } }, { status: 429, headers: NO_STORE });
      case "still_valid":
        return Response.json({ error: { code: "still_valid", message: "Este enlace sigue vigente: no necesitas uno nuevo." } }, { status: 409, headers: NO_STORE });
      case "failed":
        return Response.json({ error: { code: "send_failed", message: "No pudimos enviar el correo. Inténtalo de nuevo en unos minutos." } }, { status: 502, headers: NO_STORE });
      case "unavailable":
        return Response.json({ error: { code: "unavailable", message: "No pudimos reenviarlo automáticamente. Escríbenos con tu número de pedido." } }, { status: 409, headers: NO_STORE });
      default:
        return Response.json({ error: { code: "not_found", message: "Enlace no válido." } }, { status: 404, headers: NO_STORE });
    }
  });
}
