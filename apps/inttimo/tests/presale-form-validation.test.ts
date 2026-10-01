import { describe, expect, it } from "vitest";
import { emptyValues, progress, validateField, validateReservation, type QuestionDefinition, type ReservationValues } from "@/components/presale/form/validation";

const questions: QuestionDefinition[] = [
  { id: "texto", label: "Texto", type: "text", required: true },
  { id: "opcion", label: "Opción", type: "select", required: true, options: [{ value: "a", label: "A" }] },
  { id: "varias", label: "Varias", type: "multiselect", required: false, options: [{ value: "x", label: "X" }] },
  { id: "si", label: "Sí", type: "boolean", required: true },
];

const valid: ReservationValues = {
  ...emptyValues,
  fullName: "Ana López",
  email: "ana@ejemplo.com",
  acceptTerms: true,
  answers: { texto: "hola", opcion: "a", si: true },
};

describe("validación del formulario de preventa", () => {
  it("acepta un formulario completo", () => {
    expect(validateReservation(valid, questions)).toEqual({});
  });

  it("marca datos y preguntas obligatorias con los mismos mensajes que la API", () => {
    const errors = validateReservation(emptyValues, questions);
    expect(errors).toEqual({
      fullName: ["Escribe tu nombre completo."],
      email: ["Correo no válido."],
      "answers.texto": ["Esta pregunta es obligatoria."],
      "answers.opcion": ["Esta pregunta es obligatoria."],
      "answers.si": ["Esta pregunta es obligatoria."],
      acceptTerms: ["Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar."],
    });
  });

  it("ignora espacios en blanco en textos obligatorios", () => {
    expect(validateField("answers.texto", { ...valid, answers: { ...valid.answers, texto: "   " } }, questions)).toHaveLength(1);
  });

  it("valida el teléfono solo si se escribe", () => {
    expect(validateField("phone", valid, questions)).toEqual([]);
    expect(validateField("phone", { ...valid, phone: "55 1234 abc" }, questions)).toEqual(["Teléfono no válido."]);
    expect(validateField("phone", { ...valid, phone: "+52 (55) 1234-5678" }, questions)).toEqual([]);
  });

  it("no exige preguntas opcionales", () => {
    expect(validateField("answers.varias", valid, questions)).toEqual([]);
  });

  it("calcula el avance por sección", () => {
    expect(progress(emptyValues, questions)).toEqual({ contact: false, questions: { answered: 0, total: 3, done: false }, confirm: false });
    expect(progress(valid, questions)).toEqual({ contact: true, questions: { answered: 3, total: 3, done: true }, confirm: true });
  });
});

describe("avance con cuestionario solo opcional", () => {
  const optional: QuestionDefinition[] = [{ id: "origen", label: "Origen", type: "select", required: false, options: [{ value: "ig", label: "Instagram" }] }];

  it("no marca la sección como completa hasta responder alguna pregunta", () => {
    expect(progress(emptyValues, optional).questions.done).toBe(false);
    expect(progress({ ...emptyValues, answers: { origen: "ig" } }, optional).questions.done).toBe(true);
  });
});
