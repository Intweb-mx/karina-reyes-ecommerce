import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../security-headers.ts";

const directive = (csp: string, name: string) => csp.split("; ").find((part) => part.startsWith(`${name} `));

describe("CSP", () => {
  it("permite video del almacenamiento privado y de nadie más", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, storageEndpoint: "https://abc123.r2.cloudflarestorage.com" });
    expect(directive(csp, "media-src")).toBe("media-src 'self' https://abc123.r2.cloudflarestorage.com");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(csp).not.toContain("*");
  });

  it("sin endpoint (desarrollo local) solo permite medios propios", () => {
    expect(directive(buildContentSecurityPolicy({ isDev: true }), "media-src")).toBe("media-src 'self'");
  });

  it("ignora endpoints inválidos o que no son https en vez de abrir la política", () => {
    for (const endpoint of ["", "no es url", "http://inseguro.test", "<https://x.r2.cloudflarestorage.com>"]) {
      expect(directive(buildContentSecurityPolicy({ isDev: false, storageEndpoint: endpoint }), "media-src")).toBe("media-src 'self'");
    }
  });

  it("quita solo la ruta: el origen permitido no incluye el bucket ni parámetros", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, storageEndpoint: "https://abc.r2.cloudflarestorage.com/video-privado?x=1" });
    expect(directive(csp, "media-src")).toBe("media-src 'self' https://abc.r2.cloudflarestorage.com");
  });

  it("conserva el resto de la política (scripts, frames, formularios)", () => {
    const csp = buildContentSecurityPolicy({ isDev: false, storageEndpoint: "https://abc.r2.cloudflarestorage.com" });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });
});
