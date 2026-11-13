/*
 * Productos digitales: enlaces de descarga de UN solo uso.
 * El correo lleva /descarga/<token>; esa página solo muestra un botón. El enlace se gasta al pulsarlo (POST), no al abrir
 * el correo: así los revisores de enlaces de Gmail/Outlook no consumen la única descarga. En la base solo queda el hash.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  consumeStoreDownloadLink,
  getStoreDownloadLink,
  issueStoreDownloadLinks,
  type Database,
  type EventSource,
  type StoreDownloadState,
  type StoreOrderItem,
} from "@inttimo/database";

/** Vida de la URL firmada del archivo: lo justo para que el navegador empiece la descarga. */
const FILE_URL_SECONDS = 10 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DownloadStorage = { getSignedUrl(key: string, options: { expiresInSeconds: number; downloadName?: string }): Promise<string> };

export const hashDownloadToken = (token: string) => createHash("sha256").update(token).digest("hex");

const fileName = (slug: string) => `${slug.replace(/[^a-z0-9-]/g, "").slice(0, 60) || "descarga"}.pdf`;

/**
 * Emite un enlace nuevo por cada línea digital del pedido (y revoca los anteriores sin usar). Devuelve nombre y URL para
 * el correo. Sin líneas digitales no hace nada.
 */
export async function issueDownloadLinks(
  db: Database,
  order: { id: string },
  items: StoreOrderItem[],
  siteUrl: string,
  ctx: { source: EventSource; actor?: string | null },
): Promise<{ name: string; url: string }[]> {
  const digital = items.filter((item) => item.digital);
  if (!digital.length) return [];
  const base = siteUrl.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SITE_URL no está configurada.");
  const tokens = digital.map((item) => ({ item, token: randomBytes(32).toString("base64url") }));
  await issueStoreDownloadLinks(
    db,
    order.id,
    tokens.map(({ item, token }) => ({ productId: item.productId, tokenHash: hashDownloadToken(token) })),
    ctx,
  );
  return tokens.map(({ item, token }) => ({ name: item.name, url: `${base}/descarga/${token}` }));
}

/** Estado del enlace para la página (sin gastarlo). */
export async function downloadState(db: Database, token: string): Promise<StoreDownloadState> {
  if (!TOKEN_PATTERN.test(token)) return { status: "invalid" };
  return getStoreDownloadLink(db, hashDownloadToken(token));
}

export type DownloadGrant = { status: "ok"; url: string } | { status: "invalid" | "revoked" | "unpaid" | "used" | "unavailable" };

/** Gasta el enlace y devuelve una URL firmada de corta vida. La llave real del archivo nunca sale del servidor. */
export async function grantDownload(deps: { db: Database; storage: DownloadStorage }, token: string, now: Date = new Date()): Promise<DownloadGrant> {
  if (!TOKEN_PATTERN.test(token)) return { status: "invalid" };
  const result = await consumeStoreDownloadLink(deps.db, hashDownloadToken(token), now);
  if (result.status !== "ok") return result;
  return { status: "ok", url: await deps.storage.getSignedUrl(result.fileKey, { expiresInSeconds: FILE_URL_SECONDS, downloadName: fileName(result.productSlug) }) };
}
