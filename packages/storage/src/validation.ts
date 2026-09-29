import { createHash } from "node:crypto";
import { imageSize } from "image-size";

/*
 * Validación de archivos subidos al CMS. Nunca se confía en la extensión
 * ni en el tipo que declara el navegador: se inspeccionan los bytes.
 * Solo formatos que Karina necesita; SVG, HTML, ejecutables, etc. no.
 */

export type MediaKind = "image" | "document";

export type DetectedFile = {
  kind: MediaKind;
  mimeType: string;
  extension: string;
};

/** 4 MB: Vercel limita el cuerpo de una petición a ~4.5 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12_000;

const allowedExtensions: Record<string, MediaKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  avif: "image",
  pdf: "document",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Detecta el tipo real por su firma de bytes. */
export function detectFileType(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mimeType: "image/png", extension: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mimeType: "image/webp", extension: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brands = ascii(bytes, 8, Math.min(bytes.length, 64));
    if (/avif|avis/.test(brands)) return { kind: "image", mimeType: "image/avif", extension: "avif" };
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return { kind: "document", mimeType: "application/pdf", extension: "pdf" };
  return null;
}

export type ValidatedFile = DetectedFile & {
  originalFilename: string;
  size: number;
  width: number | null;
  height: number | null;
  checksum: string;
};

export type ValidationResult = { ok: true; file: ValidatedFile } | { ok: false; message: string };

/** Nombre original limpio (sin rutas ni caracteres de control), solo informativo. */
export function cleanOriginalFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (base || "archivo").slice(0, 200);
}

/** Valida tamaño, extensión, firma real y dimensiones. Mensajes para Karina. */
export function validateUpload(
  bytes: Uint8Array,
  filename: string,
  options: { expectedKind?: MediaKind } = {},
): ValidationResult {
  const originalFilename = cleanOriginalFilename(filename);
  if (bytes.byteLength === 0) return { ok: false, message: "El archivo está vacío." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `“${originalFilename}” pesa más de 4 MB. Reduce su tamaño e inténtalo de nuevo.` };
  }

  const extension = originalFilename.split(".").pop()?.toLowerCase() ?? "";
  const declaredKind = allowedExtensions[extension];
  if (!declaredKind) {
    return { ok: false, message: `“${originalFilename}” no es un formato permitido. Usa JPG, PNG, WebP, AVIF o PDF.` };
  }

  const detected = detectFileType(bytes);
  if (!detected || detected.kind !== declaredKind) {
    return { ok: false, message: `“${originalFilename}” no parece ser una imagen o un PDF válido.` };
  }
  if (options.expectedKind && detected.kind !== options.expectedKind) {
    return {
      ok: false,
      message: options.expectedKind === "image" ? "Para reemplazar una imagen sube otra imagen." : "Para reemplazar un documento sube otro PDF.",
    };
  }

  let width: number | null = null;
  let height: number | null = null;
  if (detected.kind === "image") {
    try {
      const size = imageSize(bytes);
      width = size.width ?? null;
      height = size.height ?? null;
    } catch {
      width = null;
    }
    if (!width || !height) return { ok: false, message: `No pudimos leer “${originalFilename}”. Puede estar dañada.` };
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      return { ok: false, message: `“${originalFilename}” es demasiado grande (máximo ${MAX_IMAGE_DIMENSION} px por lado).` };
    }
  }

  return {
    ok: true,
    file: {
      ...detected,
      originalFilename,
      size: bytes.byteLength,
      width,
      height,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
