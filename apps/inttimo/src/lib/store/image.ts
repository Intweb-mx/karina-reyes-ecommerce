import type { ProductImage } from "./contract.ts";

/**
 * Clases para mostrar una imagen de producto con `next/image` + `fill`. Las fotos de producto sobre fondo blanco
 * (`fit: "contain"`) se ven completas, con aire, sobre blanco; el resto llena el recuadro (cover).
 */
export function productImageClasses(image: Pick<ProductImage, "fit">, padding = "p-[6%]"): { frame: string; img: string } {
  return image.fit === "contain" ? { frame: "bg-white", img: `object-contain ${padding}` } : { frame: "bg-sand", img: "object-cover" };
}
