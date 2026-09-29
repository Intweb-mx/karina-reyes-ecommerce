import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { contentTypeFor } from "./content-types.ts";
import { assertSafeKey } from "./keys.ts";
import type { ObjectMetadata, ReadableStorage, StoredObject, UploadOptions } from "./types.ts";

/** Raíz del monorepo (donde está pnpm-workspace.yaml), para compartir la carpeta entre apps. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/**
 * SOLO DESARROLLO. Guarda archivos en disco (por defecto `.local-storage/`
 * en la raíz del repo, ignorada por Git) y los sirve la propia app en
 * `/local-media/...`. No usar en Vercel: su sistema de archivos es
 * temporal y se pierde en cada despliegue o instancia.
 */
export class LocalStorageAdapter implements ReadableStorage {
  readonly driver = "local";
  private readonly root: string;

  constructor(
    root: string,
    private readonly publicBaseUrl = "/local-media",
  ) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + "/")) throw new Error(`Clave fuera del directorio: ${key}`);
    return path;
  }

  async upload(key: string, body: Uint8Array, options: UploadOptions): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: "wx" }); // nunca sobrescribe
    return { key, url: this.getUrl(key), size: body.byteLength, contentType: options.contentType };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  getUrl(key: string): string {
    assertSafeKey(key);
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const info = await stat(this.pathFor(key));
      return info.isFile() ? { key, size: info.size, contentType: contentTypeFor(key), lastModified: info.mtime } : null;
    } catch {
      return null;
    }
  }

  async read(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
    try {
      return { body: new Uint8Array(await readFile(this.pathFor(key))), contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }
}
