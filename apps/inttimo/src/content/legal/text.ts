import type { LegalDocument } from "./types.ts";

/** Texto plano de un documento legal. Es lo que se guarda como versión de términos aceptada por cada compra. */
export function renderLegalText(doc: LegalDocument): string {
  const blocks = [
    doc.title.join(" "),
    doc.updated,
    ...(doc.facts?.map((fact) => `${fact.label}: ${fact.value}`) ?? []),
    ...doc.intro,
    ...[...doc.sections, ...(doc.appendix ? [doc.appendix] : [])].flatMap((section) => [section.title, ...section.paragraphs]),
  ];
  return blocks.join("\n\n");
}
