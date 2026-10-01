import { describe, expect, it } from "vitest";
import { acceptanceText, business, getLegalDocument, legalDocuments, legalPaths } from "../src/content/legal/index.ts";
import { renderLegalText } from "../src/content/legal/text.ts";

describe("documentos legales", () => {
  it("existen las 4 páginas con las rutas acordadas, en el orden del pie", () => {
    expect(legalDocuments.map((doc) => `/${doc.slug}`)).toEqual(["/terminos-y-condiciones", "/aviso-de-privacidad", "/envios-y-recoleccion", "/cambios-y-reembolsos"]);
    expect(legalPaths).toEqual({ terms: "/terminos-y-condiciones", privacy: "/aviso-de-privacidad", shipping: "/envios-y-recoleccion", refunds: "/cambios-y-reembolsos" });
    expect(getLegalDocument("otra")).toBeUndefined();
  });

  it("conservan todas las secciones de los documentos aprobados", () => {
    const counts = Object.fromEntries(legalDocuments.map((doc) => [doc.slug, doc.sections.length]));
    expect(counts).toEqual({ "terminos-y-condiciones": 28, "aviso-de-privacidad": 14, "envios-y-recoleccion": 16, "cambios-y-reembolsos": 17 });
    for (const doc of legalDocuments) {
      doc.sections.forEach((section, index) => expect(section.title.startsWith(`${index + 1}. `)).toBe(true));
    }
  });

  it("muestran los datos reales del proveedor y los datos clave de la preventa", () => {
    const terms = renderLegalText(getLegalDocument("terminos-y-condiciones")!);
    for (const text of [business.legalName, business.address, business.email, business.whatsapp, "$500.00 MXN", "1 al 15 de octubre de 2026", "26 de octubre de 2026", "hasta 500 unidades"]) {
      expect(terms).toContain(text);
    }
    expect(renderLegalText(getLegalDocument("aviso-de-privacidad")!)).toContain("Aviso de Privacidad Simplificado");
  });

  it("el texto del checkbox es el recomendado, sin cambios", () => {
    const text = Object.values(acceptanceText).join("");
    expect(text).toBe(
      "He leído y acepto los Términos y Condiciones de la preventa de UNO+UNO y el Aviso de Privacidad. Entiendo que estoy adquiriendo un producto en preventa y que mi pedido será procesado prioritariamente para su entrega antes del lanzamiento oficial del 26 de octubre de 2026, sujeto a las condiciones de entrega y paquetería aplicables.",
    );
  });
});
