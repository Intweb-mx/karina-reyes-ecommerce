import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthFetch } from "../src/server/auth/fetch.ts";

let server: Server;
let url: string;
let hits: number;
let hangFirst: number;

beforeEach(async () => {
  hits = 0;
  hangFirst = 0;
  server = createServer((_req, res) => {
    hits += 1;
    if (hits <= hangFirst) return; // nunca responde: simula una conexión muerta
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("fetch de Supabase Auth con tiempo máximo", () => {
  it("responde normal cuando el servidor contesta", async () => {
    const response = await createAuthFetch(500)(url);
    expect(await response.text()).toBe("ok");
  });

  it("una lectura que se queda colgada se corta y se reintenta con éxito", async () => {
    hangFirst = 1;
    const started = Date.now();
    const response = await createAuthFetch(200)(url);
    expect(await response.text()).toBe("ok");
    expect(hits).toBe(2);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("una lectura que se cuelga dos veces falla en lugar de esperar", async () => {
    hangFirst = 5;
    const started = Date.now();
    await expect(createAuthFetch(150)(url)).rejects.toThrow();
    expect(hits).toBe(2);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("una escritura colgada falla sin reintentar", async () => {
    hangFirst = 5;
    await expect(createAuthFetch(150)(url, { method: "POST", body: "{}" })).rejects.toThrow();
    expect(hits).toBe(1);
  });
});
