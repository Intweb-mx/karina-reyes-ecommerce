/**
 * Sube un archivo del bonus de preventa al almacenamiento PRIVADO (STORAGE_PRIVATE_BUCKET) y imprime su clave.
 *
 *   pnpm bonus:upload --file=ruta/video.mp4 --kind=video
 *   pnpm bonus:upload --file=ruta/guia.pdf  --kind=pdf
 *
 * La clave que imprime va en `bonus.videoKey` / `bonus.pdfKey` del JSON de la campaña (docs/preventa/uno-mas-uno.json).
 * Nunca sobrescribe: cada subida crea una clave nueva, así que un archivo corregido es una subida nueva.
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { contentTypeFor, createObjectKey, createPrivateStorage } from "@inttimo/storage";
import { arg, fail } from "./cli.ts";

const file = arg("file") ?? fail("Falta --file=ruta/al/archivo");
const kind = arg("kind");
if (kind !== "pdf" && kind !== "video") fail("Indica --kind=pdf o --kind=video.");

// Tope por seguridad: el archivo se carga completo en memoria antes de subirse.
const MAX_BYTES = 1_500_000_000;

const body = new Uint8Array(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file)));
if (body.byteLength === 0) fail("El archivo está vacío.");
if (body.byteLength > MAX_BYTES) fail("El archivo pesa más de 1.5 GB. Comprímelo antes de subirlo.");

/** El tipo se decide por el contenido, no por el nombre. */
function detectExtension(bytes: Uint8Array): "pdf" | "mp4" | "mov" | "webm" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "%PDF") return "pdf";
  if (ascii(4, 8) === "ftyp") return ascii(8, 12) === "qt  " ? "mov" : "mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return null;
}

const extension = detectExtension(body);
if (kind === "pdf" && extension !== "pdf") fail("El archivo no es un PDF válido.");
if (extension === "mov") fail("Es un video QuickTime (.mov, típico de iPhone) y muchos navegadores no lo reproducen. Expórtalo como MP4 H.264 (en iPhone: Ajustes > Cámara > Formatos > Más compatible, o convertirlo en Mac con QuickTime: Archivo > Exportar como) y súbelo de nuevo.");
if (kind === "video" && extension !== "mp4" && extension !== "webm") fail("El video debe ser MP4 (H.264) o WebM.");

const key = createObjectKey(basename(file), extension!, "bonus");
const storage = createPrivateStorage();
await storage.upload(key, body, { contentType: contentTypeFor(key), cacheControl: "private, max-age=3600" });

const field = kind === "pdf" ? "pdfKey" : "videoKey";
console.log(`Subido (${(body.byteLength / 1_048_576).toFixed(1)} MB, almacenamiento ${storage.driver}).`);
console.log(`\n  "${field}": "${key}"\n`);
console.log("Pégalo dentro de `bonus` en el JSON de la campaña y cárgalo con `pnpm presale:upsert`.");
process.exit(0);
