/*
 * Contenido editorial de los productos de la TIENDA, por `slug` de store_products. La base guarda solo lo comercial
 * (precio, estado, inventario, máximo por pedido); textos e imágenes viven aquí.
 *
 * ESTADO: PENDIENTE DE APROBACIÓN de Karina.
 * - Textos e imágenes de UNO+UNO salen de content/products.ts (los de la preventa); las fotos son renders de referencia.
 * - "Cómo se juega" se copió del simulador del frontend (src/lib/store/mock.ts): confirmar el texto con Karina.
 * - La imagen del bonus no se usa: el bonus es exclusivo de la preventa.
 * Un producto publicado sin entrada aquí no aparece en el catálogo ni se puede comprar.
 */
import type { Faq, ProductImage } from "../lib/store/contract.ts";
import { getProductContent } from "./products.ts";
import { faqs } from "./store.ts";

export type StoreProductContent = {
  tagline: string;
  image: ProductImage;
  gallery: ProductImage[];
  description: string[];
  includes: string[];
  howToPlay: { title: string; body: string }[];
  faqs: Faq[];
  seo: { title: string; description: string };
};

const uno = getProductContent("uno-mas-uno")!;
const UNO_FAQ_IDS = ["envios-mexico", "recoleccion", "devoluciones", "para-quien"];

const PRODUCTS: Record<string, StoreProductContent> = {
  "uno-mas-uno": {
    tagline: uno.tagline,
    image: { ...uno.thumbnail },
    gallery: [uno.hero, ...(uno.includes ? [uno.includes.image] : []), uno.thumbnail].map((image) => ({ ...image })),
    description: uno.intro,
    includes: uno.includes?.items ?? [],
    howToPlay: [
      { title: "Elijan una categoría", body: "Según el momento y lo que quieran cultivar." },
      { title: "Saquen una tarjeta", body: "Una pregunta a la vez, sin prisa." },
      { title: "Respondan y escuchen", body: "Lo importante pasa en la conversación." },
      { title: "Conecten más allá", body: "Lleven lo que descubran a su vida diaria." },
    ],
    faqs: UNO_FAQ_IDS.flatMap((id) => faqs.filter((faq) => faq.id === id)),
    seo: { title: "UNO+UNO · Conversaciones que nos acercan", description: uno.intro[1] ?? uno.tagline },
  },
};

export function getStoreProductContent(slug: string): StoreProductContent | null {
  return PRODUCTS[slug] ?? null;
}
