import { resolve } from "node:path";
import { findRepoRoot } from "./local.ts";

/*
 * Utilidades sin credenciales ni SDKs: la web pública las usa para
 * mostrar archivos sin acceso de escritura al almacenamiento.
 */

type Env = Record<string, string | undefined>;

export type StorageDriver = "local" | "s3";

export const LOCAL_MEDIA_PREFIX = "/local-media";

export function storageDriver(env: Env = process.env): StorageDriver {
  const driver = env.STORAGE_DRIVER || "local";
  if (driver !== "local" && driver !== "s3") throw new Error(`STORAGE_DRIVER no soportado: ${driver}`);
  if (driver === "local" && env.VERCEL === "1") {
    // El disco de Vercel es temporal: los archivos se perderían.
    throw new Error("STORAGE_DRIVER=local no se puede usar en Vercel. Configura STORAGE_DRIVER=s3.");
  }
  return driver;
}

/** Carpeta local de desarrollo (por defecto `<repo>/.local-storage`). */
export function localStorageDir(env: Env = process.env): string {
  return resolve(findRepoRoot(), env.STORAGE_LOCAL_DIR || ".local-storage");
}

/** Calcula la URL pública de un archivo a partir de su clave. */
export function createUrlResolver(env: Env = process.env): (key: string) => string {
  if ((env.STORAGE_DRIVER || "local") === "s3") {
    const base = env.STORAGE_PUBLIC_URL?.replace(/\/$/, "");
    if (!base) throw new Error("Falta la variable de entorno STORAGE_PUBLIC_URL para el almacenamiento.");
    return (key) => `${base}/${key}`;
  }
  return (key) => `${LOCAL_MEDIA_PREFIX}/${key}`;
}
