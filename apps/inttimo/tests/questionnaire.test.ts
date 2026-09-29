import { describe, expect, it } from "vitest";
import { buildAnswersSchema, questionsSchema } from "../src/server/presale/questionnaire.ts";
import { QUESTIONS } from "./helpers.ts";

describe("definición de preguntas", () => {
  it("acepta preguntas válidas", () => {
    expect(questionsSchema.safeParse(QUESTIONS).success).toBe(true);
  });

  it("rechaza ids repetidos, select sin opciones y opciones en texto", () => {
    expect(questionsSchema.safeParse([QUESTIONS[1], QUESTIONS[1]]).success).toBe(false);
    expect(questionsSchema.safeParse([{ id: "a", label: "A", type: "select", required: true }]).success).toBe(false);
    expect(questionsSchema.safeParse([{ id: "a", label: "A", type: "text", required: true, options: [{ value: "x", label: "x" }] }]).success).toBe(false);
    expect(questionsSchema.safeParse([{ id: "Con Espacio", label: "A", type: "text", required: true }]).success).toBe(false);
  });
});

describe("respuestas", () => {
  const schema = buildAnswersSchema(QUESTIONS);

  it("acepta respuestas válidas y descarta opcionales vacías", () => {
    const result = schema.safeParse({ como_nos_conociste: "amigos", comentarios: "  ", acepta_contacto: true });
    expect(result.success && result.data).toEqual({ como_nos_conociste: "amigos", acepta_contacto: true });
  });

  it("exige obligatorias, valida opciones y rechaza claves desconocidas", () => {
    expect(schema.safeParse({ acepta_contacto: true }).success).toBe(false);
    expect(schema.safeParse({ como_nos_conociste: "tv", acepta_contacto: true }).success).toBe(false);
    expect(schema.safeParse({ como_nos_conociste: "redes", acepta_contacto: false }).success).toBe(false);
    expect(schema.safeParse({ como_nos_conociste: "redes", acepta_contacto: true, extra: "x" }).success).toBe(false);
  });

  it("multiselect elimina duplicados y valida valores", () => {
    const multi = buildAnswersSchema([
      { id: "temas", label: "Temas", type: "multiselect", required: true, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    ]);
    const ok = multi.safeParse({ temas: ["a", "a", "b"] });
    expect(ok.success && ok.data).toEqual({ temas: ["a", "b"] });
    expect(multi.safeParse({ temas: [] }).success).toBe(false);
    expect(multi.safeParse({ temas: ["z"] }).success).toBe(false);
  });

  it("respeta el máximo de caracteres", () => {
    const text = buildAnswersSchema([{ id: "t", label: "T", type: "text", required: true, maxLength: 5 }]);
    expect(text.safeParse({ t: "123456" }).success).toBe(false);
  });
});
