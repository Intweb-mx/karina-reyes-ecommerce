import { describe, expect, it } from "vitest";
import { createSkydropx } from "../src/server/shipping/skydropx.ts";
import type { ContactAddress } from "../src/server/shipping/provider.ts";

type Call = { method: string; path: string; body: unknown };

const origin: ContactAddress = {
  name: "Karina Reyes Carnero",
  company: "INTTIMO",
  street: "Paseo de Valdivia 702, 159",
  neighborhood: "Torralba Residencial",
  city: "Chihuahua",
  state: "Chihuahua",
  postalCode: "31160",
  phone: "6391315972",
  email: "inttimojuegosdemesa@gmail.com",
  reference: "Casa en esquina con palmera, portón negro, junto a la tienda",
};

const customer: ContactAddress = {
  name: "María Guadalupe Hernández de la Cruz Villalobos",
  company: null,
  street: "Robledo 19",
  neighborhood: "Bosque Esmeralda",
  city: "López Mateos",
  state: "Estado De México",
  postalCode: "52930",
  phone: "6366990505",
  email: "cliente@example.com",
  reference: "Entre calle Pino y calle Roble, casa azul con reja blanca y portón",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function client(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const call: Call = { method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    if (call.path === "/api/v1/oauth/token") return json(200, { access_token: "t", expires_in: 7200 });
    return respond(call);
  };
  const provider = createSkydropx({ clientId: "id", clientSecret: "secret", baseUrl: "https://sb-pro.skydropx.com", fetch: fetchStub, sleep: async () => {} });
  return { provider, calls };
}

const shipmentBody = { data: { id: "ship-1", attributes: { master_tracking_number: "TRK123", label_url: "https://x/label.pdf", carrier_name: "Paquetexpress" } } };

describe("SkyDropX createShipment", () => {
  it("recorta nombre y referencia a los máximos que acepta SkyDropX (30/30 origen, 30/40 destino)", async () => {
    const { provider, calls } = client(() => json(200, shipmentBody));
    await provider.createShipment({ quotationId: "q", rateId: "r", from: origin, to: customer, consignmentNote: "60141102", packageType: "4G" });
    const sent = (calls.find((c) => c.path === "/api/v1/shipments")!.body as { shipment: Record<string, Record<string, string>> }).shipment;
    expect(sent.address_from!.name!.length).toBeLessThanOrEqual(30);
    expect(sent.address_from!.reference!.length).toBeLessThanOrEqual(30);
    expect(sent.address_to!.name!.length).toBeLessThanOrEqual(30);
    expect(sent.address_to!.reference!.length).toBeLessThanOrEqual(40);
    expect(sent.address_to!.company!.length).toBeLessThanOrEqual(60);
  });

  it("si SkyDropX rechaza el envío, el error conserva el motivo real y no el del reintento plano", async () => {
    const { provider } = client((call) => {
      const nested = typeof call.body === "object" && call.body !== null && "shipment" in call.body;
      return nested
        ? json(422, { errors: [{ detail: "El código postal del remitente no está verificado para Paquetexpress" }] })
        : json(422, { errors: [{ detail: "param is missing or the value is empty: shipment" }] });
    });
    await expect(provider.createShipment({ quotationId: "q", rateId: "r", from: origin, to: customer, consignmentNote: "60141102", packageType: "4G" })).rejects.toThrow(/no está verificado/);
  });
});
