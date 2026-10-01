export type LegalSection = { title: string; paragraphs: string[] };

export type LegalDocument = {
  /** Ruta pública sin barra inicial, p. ej. "terminos-y-condiciones". */
  slug: string;
  /** Título en el pie y en la pestaña. */
  shortTitle: string;
  /** Título grande de la página, en dos líneas si hace falta. */
  title: string[];
  /** Línea bajo el título (fecha de actualización). */
  updated: string;
  /** Datos fijos antes del cuerpo (p. ej. proveedor, domicilio). */
  facts?: { label: string; value: string }[];
  intro: string[];
  sections: LegalSection[];
  /** Bloque final con título propio (p. ej. aviso simplificado). */
  appendix?: LegalSection;
};
