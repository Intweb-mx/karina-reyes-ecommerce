import { cambios } from "./cambios.ts";
import { envios } from "./envios.ts";
import { privacidad } from "./privacidad.ts";
import { terminos } from "./terminos.ts";
import type { LegalDocument } from "./types.ts";

export { business, LEGAL_UPDATED } from "./business.ts";
export type { LegalDocument } from "./types.ts";

/** Orden = orden del bloque "Legal" del pie de página. */
export const legalDocuments: readonly LegalDocument[] = [terminos, privacidad, envios, cambios];

export const legalPaths = {
  terms: `/${terminos.slug}`,
  privacy: `/${privacidad.slug}`,
  shipping: `/${envios.slug}`,
  refunds: `/${cambios.slug}`,
} as const;

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return legalDocuments.find((doc) => doc.slug === slug);
}

/** Texto del checkbox de aceptación (exacto, según "Implementación legal en web", §4). Los enlaces los pone el componente. */
export const acceptanceText = {
  beforeTerms: "He leído y acepto los ",
  terms: "Términos y Condiciones",
  between: " de la preventa de UNO+UNO y el ",
  privacy: "Aviso de Privacidad",
  after:
    ". Entiendo que estoy adquiriendo un producto en preventa y que mi pedido será procesado prioritariamente para su entrega antes del lanzamiento oficial del 26 de octubre de 2026, sujeto a las condiciones de entrega y paquetería aplicables.",
} as const;
