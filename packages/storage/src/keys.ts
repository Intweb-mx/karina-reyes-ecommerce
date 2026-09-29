import { randomUUID } from "node:crypto";

/** Convierte un nombre de archivo en un segmento seguro y legible (sin extensión). */
export function slugifyFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "archivo";
}

/**
 * Clave única y no adivinable: `<carpeta>/<aaaa>/<mm>/<uuid>-<nombre>.<ext>`.
 * La extensión la decide el tipo detectado, nunca el nombre original.
 */
export function createObjectKey(originalName: string, extension: string, folder = "media", now = new Date()): string {
  if (!/^[a-z0-9]{2,5}$/.test(extension)) throw new Error("Extensión no válida.");
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${folder}/${year}/${month}/${randomUUID()}-${slugifyFilename(originalName)}.${extension}`;
}

/** Rechaza claves con recorridos de ruta, absolutas o con caracteres raros. */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 300 || key.startsWith("/") || key.includes("..") || !/^[a-z0-9][a-z0-9/._-]*$/i.test(key)) {
    throw new Error(`Clave de almacenamiento no válida: ${key}`);
  }
}
