import { describe, expect, it } from "vitest";
import { getProductContent } from "../src/content/products.ts";

describe("contenido de producto por campaña", () => {
  it("uno-mas-uno y demo comparten el contenido de la landing", () => {
    expect(getProductContent("uno-mas-uno")).not.toBeNull();
    expect(getProductContent("demo")).toBe(getProductContent("uno-mas-uno"));
  });

  it("una campaña desconocida no recibe contenido", () => {
    expect(getProductContent("otra")).toBeNull();
  });
});
