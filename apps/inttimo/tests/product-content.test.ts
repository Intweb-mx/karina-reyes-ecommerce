import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductContent } from "../src/content/products.ts";

afterEach(() => vi.unstubAllEnvs());

describe("contenido de producto por campaña", () => {
  it("uno-mas-uno tiene contenido de landing", () => {
    expect(getProductContent("uno-mas-uno")).not.toBeNull();
  });

  it("la campaña demo solo tiene contenido fuera de producción", () => {
    expect(getProductContent("demo")).toBe(getProductContent("uno-mas-uno"));
    vi.stubEnv("NODE_ENV", "production");
    expect(getProductContent("demo")).toBeNull();
  });

  it("una campaña desconocida no recibe contenido", () => {
    expect(getProductContent("otra")).toBeNull();
  });
});
