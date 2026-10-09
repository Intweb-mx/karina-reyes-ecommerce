import { ConfigError, getFulfillmentDeps, handle } from "@/server/presale/runtime";
import { handleSkydropxWebhook } from "@/server/presale/skydropx-webhook";

/**
 * Avisos de rastreo de SkyDropX (Conexiones → Webhooks). Autenticación HMAC-SHA512 sobre el cuerpo crudo:
 * SKYDROPX_WEBHOOK_SECRET es la clave secreta y SKYDROPX_WEBHOOK_HEADER el nombre del encabezado (por defecto Authorization).
 * Sin clave configurada responde 503: nunca acepta avisos sin firmar.
 */
export async function POST(request: Request) {
  return handle("skydropx_webhook", async () => {
    const secret = process.env.SKYDROPX_WEBHOOK_SECRET;
    if (!secret) throw new ConfigError("SKYDROPX_WEBHOOK_SECRET no está configurada.");
    const header = process.env.SKYDROPX_WEBHOOK_HEADER || "authorization";
    const rawBody = await request.text();
    const result = await handleSkydropxWebhook(getFulfillmentDeps(), secret, rawBody, request.headers.get(header));
    return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
  });
}
