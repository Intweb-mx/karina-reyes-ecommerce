/*
 * Contenido editorial de producto para la página de preventa, por `slug` de campaña.
 *
 * Fuente: docs/briefs/preventa/CAMBIOS PREVENTA UNO + UNO.docx (30 sep 2026, "versión para revisión con Karina").
 * ESTADO: PENDIENTE DE APROBACIÓN FINAL. Textos e imágenes deben confirmarse con Karina antes de publicar.
 * Las fotografías actuales son renders de referencia del mockup (placeholder): sustituir por fotos y assets
 * oficiales de UNO+UNO (brief §11). Precio, fechas de preventa, cantidad máxima, cuestionario y términos
 * NO van aquí: vienen de la campaña en la base de datos.
 */
export type ProductImage = { src: string; width: number; height: number; alt: string; placeholder?: boolean };

export type ProductContent = {
  tagline: string;
  intro: string[];
  /** Fecha del lanzamiento oficial (YYYY-MM-DD, hora de México). */
  launchDate?: string;
  benefits: { icon: "heart" | "people" | "leaf" | "gem"; title: string; body: string }[];
  includes?: { eyebrow: string; title: string; subtitle: string; items: string[]; image: ProductImage };
  bonus?: { eyebrow: string; title: string; body: string; note: string; short: string; image: ProductImage };
  hero: ProductImage;
  thumbnail: ProductImage;
};

// Imágenes de referencia del mockup (1448×1086 y 1122×1402). Reemplazar por fotografía oficial.
const img = (file: string, width: number, height: number, alt: string): ProductImage => ({ src: `/images/preventa/${file}`, width, height, alt, placeholder: true });

const unoMasUno: ProductContent = {
  tagline: "Conversaciones que nos acercan.",
  intro: [
    "Hay conversaciones que cambian cuando nos damos el tiempo de tenerlas.",
    "UNO+UNO es una experiencia creada para matrimonios que quieren conocerse más, conversar con intención y seguir cultivando lo que pasa entre ellos.",
  ],
  launchDate: "2026-10-26",
  benefits: [
    { icon: "heart", title: "Conéctense", body: "Preguntas que abren conversaciones reales." },
    { icon: "people", title: "Conózcanse más", body: "Descubran nuevas facetas el uno del otro." },
    { icon: "leaf", title: "Fortalezcan su relación", body: "Momentos de calidad sin distracciones." },
    { icon: "gem", title: "Cultiven su matrimonio", body: "Una herramienta para seguir construyendo juntos." },
  ],
  includes: {
    eyebrow: "Qué incluye",
    title: "164 tarjetas",
    subtitle: "para conversar, descubrirse y seguir cultivando su relación.",
    items: ["160 tarjetas de preguntas", "4 tarjetas de categorías", "1 tarjeta de acuerdo de pareja", "1 tarjeta de cierre", "1 instructivo"],
    image: img("uno-mas-uno-contenido-categorias.jpg", 1448, 1086, "Caja de UNO+UNO abierta con las tarjetas de categorías y tarjetas de preguntas"),
  },
  bonus: {
    eyebrow: "Solo durante la preventa",
    title: "Tu UNO+UNO incluye un bonus especial.",
    body: "Una guía digital de preguntas complementarias para seguir conversando juntos.",
    note: "Disponible exclusivamente para las compras realizadas durante la preventa.",
    short: "Incluye bonus exclusivo de preventa.",
    image: img("uno-mas-uno-bonus-digital.jpg", 1448, 1086, "Caja de UNO+UNO junto a una tableta con la guía digital exclusiva de preventa"),
  },
  hero: img("uno-mas-uno-hero-caja-y-tarjetas.jpg", 1122, 1402, "Caja de UNO+UNO con tarjetas de preguntas sobre una piedra y textiles cálidos"),
  thumbnail: img("uno-mas-uno-caja-y-mazos.jpg", 1448, 1086, "Caja de UNO+UNO"),
};

const PRODUCTS: Record<string, ProductContent> = {
  "uno-mas-uno": unoMasUno,
};

/**
 * Contenido de la campaña. La campaña `demo` (`pnpm presale:upsert` con campaign.dev.json) usa el de UNO+UNO
 * para poder revisar el diseño completo también en Vercel mientras no exista la campaña real.
 * Retirar el alias `demo` cuando se cargue la campaña `uno-mas-uno` con datos aprobados.
 */
export function getProductContent(slug: string): ProductContent | null {
  return PRODUCTS[slug] ?? (slug === "demo" ? unoMasUno : null);
}
