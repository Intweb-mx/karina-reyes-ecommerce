import "server-only";
import { ShippingUnavailableError, type AreaAddress, type ContactAddress, type Rate, type Shipment, type ShippingProvider } from "./provider.ts";

/**
 * Cliente de SkyDropX Pro (https://pro.skydropx.com/api-docs): OAuth2 client credentials, cotización asíncrona
 * (se consulta hasta `is_completed`) y creación de guía. Los rates valen 24 h.
 * La documentación pública no fija si el cuerpo va anidado ("quotation"/"shipment") o plano: se intenta anidado y,
 * si SkyDropX responde 400/422, plano. Validar en sandbox antes de usar en producción.
 */
type Config = { clientId: string; clientSecret: string; baseUrl: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

type Json = Record<string, unknown>;

const QUOTE_POLL = { attempts: 8, intervalMs: 1000 };
const SHIPMENT_POLL = { attempts: 6, intervalMs: 1500 };

export function skydropxBaseUrl(env: string | undefined): string {
  return env === "production" ? "https://pro.skydropx.com" : "https://sb-pro.skydropx.com";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Busca la primera aparición de una clave en la respuesta (soporta JSON plano y JSON:API con data/attributes/included). */
export function findKey(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (!Array.isArray(node) && key in node && (node as Json)[key] != null) return (node as Json)[key];
  for (const value of Object.values(node as Json)) {
    const found = findKey(value, key, depth + 1);
    if (found != null) return found;
  }
  return undefined;
}

/** Convierte los rates de SkyDropX a opciones normalizadas (centavos, solo los cotizados con éxito). */
export function parseRates(body: unknown): Rate[] {
  const rates = findKey(body, "rates");
  if (!Array.isArray(rates)) return [];
  return rates.flatMap((raw): Rate[] => {
    const r = ((raw as Json).attributes as Json | undefined) ?? (raw as Json);
    if (r.success === false) return [];
    const total = num(r.total ?? r.total_pricing ?? r.amount);
    const rateId = str((raw as Json).id ?? r.id);
    const carrier = str(r.provider_display_name ?? r.provider_name ?? r.carrier);
    if (!rateId || !carrier || total === null || total <= 0) return [];
    return [
      {
        rateId,
        carrier,
        service: str(r.provider_service_name ?? r.service_level_name ?? r.service) ?? "",
        days: num(r.days),
        amount: Math.round(total * 100),
        currency: (str(r.currency) ?? "MXN").toLowerCase(),
      },
    ];
  });
}

function parseShipment(body: unknown): Shipment {
  const shipmentId = str(findKey(body, "id"));
  if (!shipmentId) throw new ShippingUnavailableError("SkyDropX no devolvió el id del envío.");
  return {
    shipmentId,
    trackingNumber: str(findKey(body, "tracking_number") ?? findKey(body, "master_tracking_number")),
    labelUrl: str(findKey(body, "label_url")),
    carrier: str(findKey(body, "carrier_name") ?? findKey(body, "provider_name")),
  };
}

const area = (a: AreaAddress) => ({ country_code: "MX", postal_code: a.postalCode, area_level1: a.state, area_level2: a.city, area_level3: a.neighborhood });

const contact = (a: ContactAddress) => ({
  ...area(a),
  name: a.name,
  company: a.company ?? a.name,
  street1: a.street,
  phone: a.phone,
  email: a.email,
  reference: a.reference ?? "",
});

export function createSkydropx(config: Config): ShippingProvider {
  const http = config.fetch ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const response = await http(`${config.baseUrl}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }),
    });
    const body = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok || typeof body.access_token !== "string") throw new ShippingUnavailableError(`SkyDropX: no se pudo autenticar (${response.status}).`);
    token = { value: body.access_token, expiresAt: Date.now() + (num(body.expires_in) ?? 7200) * 1000 };
    return token.value;
  }

  async function request(method: "GET" | "POST", path: string, body?: Json): Promise<{ status: number; body: unknown }> {
    const response = await http(`${config.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  /** POST anidado bajo `wrapper`; si SkyDropX lo rechaza por formato (400/422), se reintenta plano. */
  async function post(path: string, wrapper: string, payload: Json): Promise<unknown> {
    let result = await request("POST", path, { [wrapper]: payload });
    if (result.status === 400 || result.status === 422) result = await request("POST", path, payload);
    if (result.status >= 300) throw new ShippingUnavailableError(`SkyDropX ${path} respondió ${result.status}: ${JSON.stringify(result.body).slice(0, 300)}`);
    return result.body;
  }

  return {
    async quote({ from, to, parcel, carriers }) {
      const parcels = [{ weight: parcel.weightKg, length: parcel.lengthCm, width: parcel.widthCm, height: parcel.heightCm }];
      const created = await post("/api/v1/quotations", "quotation", {
        address_from: area(from),
        address_to: area(to),
        parcels,
        ...(carriers.length ? { requested_carriers: carriers } : {}),
      });
      const quotationId = str(findKey(created, "id"));
      if (!quotationId) throw new ShippingUnavailableError("SkyDropX no devolvió el id de la cotización.");

      let latest: unknown = created;
      for (let attempt = 0; attempt < QUOTE_POLL.attempts && findKey(latest, "is_completed") !== true; attempt++) {
        await sleep(QUOTE_POLL.intervalMs);
        const polled = await request("GET", `/api/v1/quotations/${encodeURIComponent(quotationId)}`);
        if (polled.status < 300) latest = polled.body;
      }
      return { quotationId, rates: parseRates(latest) };
    },

    async createShipment({ quotationId, rateId, from, to, consignmentNote, packageType }) {
      const created = await post("/api/v1/shipments", "shipment", {
        quotation_id: quotationId,
        rate_id: rateId,
        address_from: contact(from),
        address_to: contact(to),
        packages: [{ package_number: "1", package_protected: false, consignment_note: consignmentNote, package_type: packageType }],
      });
      let shipment = parseShipment(created);
      for (let attempt = 0; attempt < SHIPMENT_POLL.attempts && !(shipment.trackingNumber && shipment.labelUrl); attempt++) {
        await sleep(SHIPMENT_POLL.intervalMs);
        shipment = await getShipment(shipment.shipmentId);
      }
      return shipment;
    },

    getShipment,
  };

  async function getShipment(shipmentId: string): Promise<Shipment> {
    const result = await request("GET", `/api/v1/shipments/${encodeURIComponent(shipmentId)}`);
    if (result.status >= 300) throw new ShippingUnavailableError(`SkyDropX shipments/${shipmentId} respondió ${result.status}.`);
    return { ...parseShipment(result.body), shipmentId };
  }
}
