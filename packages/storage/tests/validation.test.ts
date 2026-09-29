import { describe, expect, it } from "vitest";
import { cleanOriginalFilename, detectFileType, MAX_UPLOAD_BYTES, validateUpload } from "../src/index.ts";
import { PDF_MINIMAL, PNG_1x1, PNG_3x2 } from "./fixtures.ts";

describe("detección por bytes", () => {
  it("reconoce PNG y PDF por su firma", () => {
    expect(detectFileType(PNG_1x1)?.mimeType).toBe("image/png");
    expect(detectFileType(PDF_MINIMAL)?.mimeType).toBe("application/pdf");
    expect(detectFileType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectFileType(Buffer.from("MZ\x90\x00ejecutable"))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("acepta una imagen válida y extrae metadata", () => {
    const result = validateUpload(PNG_3x2, "Retrato Karina.png");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file).toMatchObject({ kind: "image", mimeType: "image/png", extension: "png", width: 3, height: 2, size: PNG_3x2.length });
      expect(result.file.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("acepta PDF sin dimensiones", () => {
    const result = validateUpload(PDF_MINIMAL, "guia.pdf");
    expect(result.ok && result.file.kind === "document" && result.file.width === null).toBe(true);
  });

  it("rechaza formatos no permitidos y archivos disfrazados", () => {
    expect(validateUpload(Buffer.from("<svg/>"), "logo.svg")).toMatchObject({ ok: false, message: expect.stringMatching(/no es un formato permitido/) });
    expect(validateUpload(Buffer.from("MZ ejecutable"), "foto.png")).toMatchObject({ ok: false, message: expect.stringMatching(/no parece ser/) });
    expect(validateUpload(PDF_MINIMAL, "foto.jpg")).toMatchObject({ ok: false });
    expect(validateUpload(PNG_1x1, "documento.pdf")).toMatchObject({ ok: false });
  });

  it("rechaza archivos demasiado grandes o vacíos", () => {
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect(validateUpload(big, "grande.png")).toMatchObject({ ok: false, message: expect.stringMatching(/más de 4 MB/) });
    expect(validateUpload(Buffer.alloc(0), "vacio.png")).toMatchObject({ ok: false, message: "El archivo está vacío." });
  });

  it("exige el mismo tipo al reemplazar", () => {
    expect(validateUpload(PDF_MINIMAL, "guia.pdf", { expectedKind: "image" })).toMatchObject({ ok: false, message: "Para reemplazar una imagen sube otra imagen." });
  });

  it("limpia nombres originales", () => {
    expect(cleanOriginalFilename("../../x/Fo\u0000to.png")).toBe("Foto.png");
  });
});
