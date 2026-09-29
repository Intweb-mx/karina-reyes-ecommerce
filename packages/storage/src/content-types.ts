/** Tipos de archivo admitidos y su extensión canónica. */
export const contentTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
};

export function contentTypeFor(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return contentTypeByExtension[extension] ?? "application/octet-stream";
}
