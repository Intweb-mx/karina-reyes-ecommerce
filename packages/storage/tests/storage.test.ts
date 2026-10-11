import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertSafeKey, createObjectKey, createPrivateStorage, createStorage, createUrlResolver, LocalStorageAdapter, S3StorageAdapter, slugifyFilename, storageDriver } from "../src/index.ts";

describe("claves", () => {
  it("nombres seguros sin acentos ni extensión original", () => {
    expect(slugifyFilename("Guía Conversaciones (final).PDF")).toBe("guia-conversaciones-final");
    expect(slugifyFilename("../../etc/passwd")).toBe("passwd");
    expect(slugifyFilename("C:\\fotos\\Retrato.JPG")).toBe("retrato");
  });

  it("claves únicas con carpeta, fecha y extensión detectada", () => {
    const key = createObjectKey("Foto Hero.exe", "webp", "media", new Date("2026-03-05T00:00:00Z"));
    expect(key).toMatch(/^media\/2026\/03\/[0-9a-f-]{36}-foto-hero\.webp$/);
    expect(createObjectKey("a.png", "png")).not.toBe(createObjectKey("a.png", "png"));
    expect(() => createObjectKey("a", "../x")).toThrow();
  });

  it("rechaza recorridos de ruta y caracteres raros", () => {
    for (const key of ["../x", "/etc/passwd", "a/../../b", "a\\b", "", "a b", "a%2e%2e"]) {
      expect(() => assertSafeKey(key)).toThrow();
    }
  });
});

describe("LocalStorageAdapter", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("sube, consulta, lee y elimina; nunca sobrescribe", async () => {
    dir = await mkdtemp(join(tmpdir(), "kr-storage-"));
    const storage = new LocalStorageAdapter(dir);
    const key = "media/2026/01/a.png";
    const stored = await storage.upload(key, new Uint8Array([1, 2, 3]), { contentType: "image/png" });
    expect(stored.url).toBe("/local-media/media/2026/01/a.png");
    expect(await storage.exists(key)).toBe(true);
    expect(await storage.getMetadata(key)).toMatchObject({ size: 3, contentType: "image/png" });
    expect((await storage.read(key))?.body).toEqual(new Uint8Array([1, 2, 3]));
    await expect(storage.upload(key, new Uint8Array([9]), { contentType: "image/png" })).rejects.toThrow();
    expect(await readFile(join(dir, key))).toEqual(Buffer.from([1, 2, 3]));
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    expect(await storage.read(key)).toBeNull();
  });
});

describe("configuración por variables", () => {
  it("local por defecto; s3 exige variables; nunca local en Vercel", () => {
    expect(createStorage({}).driver).toBe("local");
    expect(() => createStorage({ STORAGE_DRIVER: "s3" })).toThrow(/STORAGE_BUCKET/);
    expect(() => storageDriver({ STORAGE_DRIVER: "ftp" })).toThrow(/no soportado/);
    expect(() => storageDriver({ VERCEL: "1" })).toThrow(/Vercel/);
    const s3 = createStorage({
      STORAGE_DRIVER: "s3",
      STORAGE_BUCKET: "b",
      STORAGE_ACCESS_KEY: "k",
      STORAGE_SECRET_KEY: "s",
      STORAGE_PUBLIC_URL: "https://media.example.com/",
    });
    expect(s3.getUrl("media/a.png")).toBe("https://media.example.com/media/a.png");
  });

  it("el resolvedor de URL no necesita credenciales", () => {
    expect(createUrlResolver({})("media/a.png")).toBe("/local-media/media/a.png");
    expect(createUrlResolver({ STORAGE_DRIVER: "s3", STORAGE_PUBLIC_URL: "https://cdn.example.com" })("media/a.png")).toBe("https://cdn.example.com/media/a.png");
  });
});

describe("almacenamiento privado (URLs firmadas)", () => {
  const privateS3 = new S3StorageAdapter({ bucket: "inttimo-privado", region: "us-east-1", accessKeyId: "AKIATEST", secretAccessKey: "secreto-de-prueba" });

  it("firma localmente una URL que vence y no depende de una base pública", async () => {
    const url = new URL(await privateS3.getSignedUrl("bonus/video.mp4", { expiresInSeconds: 600 }));
    expect(url.pathname).toContain("bonus/video.mp4");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(() => privateS3.getUrl("bonus/video.mp4")).toThrow(/privado/);
  });

  it("con downloadName fuerza la descarga con un nombre seguro", async () => {
    const url = new URL(await privateS3.getSignedUrl("bonus/guia.pdf", { expiresInSeconds: 60, downloadName: 'Después "de" la pregunta.pdf' }));
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment; filename="[\w.-]+"$/);
  });

  it("no firma claves peligrosas", async () => {
    await expect(privateS3.getSignedUrl("../secreto", { expiresInSeconds: 60 })).rejects.toThrow();
  });

  it("exige el bucket privado en s3 y funciona sin variables en local", () => {
    const base = { STORAGE_DRIVER: "s3", STORAGE_ACCESS_KEY: "k", STORAGE_SECRET_KEY: "s", STORAGE_BUCKET: "publico", STORAGE_PUBLIC_URL: "https://cdn.test" };
    expect(() => createPrivateStorage(base)).toThrow(/STORAGE_PRIVATE_BUCKET/);
    expect(createPrivateStorage({ ...base, STORAGE_PRIVATE_BUCKET: "privado" }).driver).toBe("s3");
    expect(createPrivateStorage({ STORAGE_DRIVER: "local" }).driver).toBe("local");
  });
});
