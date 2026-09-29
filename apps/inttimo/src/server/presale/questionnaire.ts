import type { Answers, QuestionDefinition } from "@inttimo/database";
import { z } from "zod";

const optionSchema = z.object({ value: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(200) });

/** Valida las preguntas que se guardan en la campaña (CLI / futuro panel). */
export const questionsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9_]{1,40}$/, "id: solo a-z, 0-9 y guion bajo (máx. 40)"),
        label: z.string().trim().min(1).max(300),
        type: z.enum(["text", "textarea", "select", "multiselect", "boolean"]),
        required: z.boolean(),
        helpText: z.string().trim().max(500).optional(),
        options: z.array(optionSchema).min(1).max(30).optional(),
        maxLength: z.number().int().min(1).max(5000).optional(),
      })
      .superRefine((question, ctx) => {
        const needsOptions = question.type === "select" || question.type === "multiselect";
        if (needsOptions && !question.options?.length) ctx.addIssue({ code: "custom", message: `${question.id}: requiere options` });
        if (!needsOptions && question.options) ctx.addIssue({ code: "custom", message: `${question.id}: options solo aplica a select/multiselect` });
        if (question.options && new Set(question.options.map((o) => o.value)).size !== question.options.length) {
          ctx.addIssue({ code: "custom", message: `${question.id}: valores de options repetidos` });
        }
      }),
  )
  .max(30)
  .superRefine((questions, ctx) => {
    if (new Set(questions.map((q) => q.id)).size !== questions.length) ctx.addIssue({ code: "custom", message: "ids de preguntas repetidos" });
  }) satisfies z.ZodType<QuestionDefinition[]>;

const DEFAULT_MAX_LENGTH = { text: 200, textarea: 2000 } as const;

function answerSchema(question: QuestionDefinition): z.ZodType<Answers[string] | undefined> {
  const requiredMessage = "Esta pregunta es obligatoria.";
  switch (question.type) {
    case "text":
    case "textarea": {
      const max = question.maxLength ?? DEFAULT_MAX_LENGTH[question.type];
      const base = z.string().trim().max(max, `Máximo ${max} caracteres.`);
      return question.required
        ? base.min(1, requiredMessage)
        : base.optional().transform((value) => (value ? value : undefined));
    }
    case "select": {
      const values = (question.options ?? []).map((o) => o.value);
      const base = z.string().refine((value) => values.includes(value), "Opción no válida.");
      return question.required ? z.string({ error: requiredMessage }).pipe(base) : base.optional();
    }
    case "multiselect": {
      const values = (question.options ?? []).map((o) => o.value);
      const base = z
        .array(z.string().refine((value) => values.includes(value), "Opción no válida."))
        .max(100)
        // Tras quitar duplicados nunca excede el número de opciones (cada valor ya se validó).
        .transform((items) => [...new Set(items)]);
      return question.required ? base.refine((items) => items.length > 0, requiredMessage) : base.optional();
    }
    case "boolean":
      return question.required ? z.literal(true, { error: requiredMessage }) : z.boolean().optional();
  }
}

/** Esquema de respuestas construido a partir de las preguntas de la campaña. Rechaza claves desconocidas. */
export function buildAnswersSchema(questions: QuestionDefinition[]): z.ZodType<Answers> {
  const shape = Object.fromEntries(questions.map((question) => [question.id, answerSchema(question)]));
  return z
    .strictObject(shape)
    .transform((answers) => Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined)) as Answers);
}
