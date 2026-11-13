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

/**
 * Paquetes de UNO+UNO (dúo, 6 y 10). Precio, envío gratis e inventario vienen de la base (docs/store/catalogo.json);
 * aquí solo el texto. Fotos: las de UNO+UNO hasta tener fotografía del paquete. Textos PENDIENTES DE APROBACIÓN.
 */
function unoPack(units: number, tagline: string, extra: string): StoreProductContent {
  const base = PRODUCTS["uno-mas-uno"]!;
  return {
    ...base,
    tagline,
    gallery: base.gallery.map((image) => ({ ...image })),
    image: { ...base.image },
    description: [`${units} juegos UNO+UNO completos, cada uno con sus 164 tarjetas.`, extra, ...uno.intro.slice(1)],
    includes: [`${units} juegos UNO+UNO`, ...base.includes.map((item) => `${item} (en cada juego)`)],
    seo: { title: `UNO+UNO · ${tagline}`, description: `${units} juegos UNO+UNO. ${extra}` },
  };
}

PRODUCTS["uno-mas-uno-duo"] = unoPack(2, "Pack dúo", "Uno para ustedes y otro para regalar.");
PRODUCTS["uno-mas-uno-paquete-6"] = unoPack(6, "Paquete de 6", "Pensado para iglesias, ministerios y grupos de matrimonios.");
PRODUCTS["uno-mas-uno-paquete-10"] = unoPack(10, "Paquete de 10", "Pensado para iglesias, ministerios, retiros y grupos de matrimonios.");

/**
 * Guía digital «Después de la pregunta» (el mismo PDF del bonus de preventa), a la venta como complemento de UNO+UNO o
 * sola. Se entrega con un enlace de descarga de un solo uso. Texto basado en el del bonus: PENDIENTE DE APROBACIÓN.
 */
const bonus = uno.bonus!;
PRODUCTS["despues-de-la-pregunta"] = {
  tagline: "Guía digital para seguir conversando",
  image: { ...bonus.image },
  gallery: [{ ...bonus.image }],
  description: [
    "«Después de la pregunta» es una guía digital de preguntas complementarias para seguir conversando juntos, más allá de las tarjetas.",
    "Es el complemento de UNO+UNO: úsenla después de jugar o en cualquier momento en que quieran ir un poco más profundo.",
  ],
  includes: ["Guía en PDF «Después de la pregunta»", "Enlace de descarga por correo al confirmar tu pago", "Para leer en el teléfono o imprimir"],
  howToPlay: [
    { title: "Compra la guía", body: "Sola o junto con tu UNO+UNO." },
    { title: "Revisa tu correo", body: "Al confirmar tu pago te llega el enlace de descarga." },
    { title: "Descárgala una vez", body: "El enlace sirve una sola vez: guarda el archivo en tu dispositivo." },
    { title: "Sigan conversando", body: "Úsenla después de jugar o cuando quieran ir más profundo." },
  ],
  faqs: [
    {
      id: "pdf-descarga",
      category: "producto",
      question: "¿Cómo recibo la guía?",
      answer: "Al confirmar tu pago te enviamos a tu correo un enlace de descarga. El enlace sirve una sola vez: ábrelo cuando estés listo para guardar el archivo.",
    },
    {
      id: "pdf-perdido",
      category: "producto",
      question: "¿Qué hago si perdí el archivo o la descarga falló?",
      answer: "Escríbenos por WhatsApp o correo con tu número de pedido y te enviamos un enlace nuevo al correo de tu compra.",
    },
    {
      id: "pdf-envio",
      category: "producto",
      question: "¿Tiene costo de envío?",
      answer: "No. Es un producto digital: si compras solo la guía, no necesitas dirección ni envío.",
    },
  ],
  seo: { title: "Después de la pregunta · Guía digital de UNO+UNO", description: "Guía digital en PDF con preguntas complementarias para seguir conversando juntos. Complemento de UNO+UNO." },
};

export function getStoreProductContent(slug: string): StoreProductContent | null {
  return PRODUCTS[slug] ?? null;
}
