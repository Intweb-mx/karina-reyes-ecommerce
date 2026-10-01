/*
 * Validación previa en el navegador: da respuesta inmediata sin ir al servidor.
 * Refleja las reglas y mensajes de src/server/presale (reservations.ts, questionnaire.ts),
 * pero el servidor sigue siendo la fuente de verdad: sus errores siempre se muestran.
 */
import type { PublicCampaign } from "@/server/presale/contract";

export type QuestionDefinition = PublicCampaign["questions"][number];

export type AnswerValue = string | string[] | boolean;
export type FieldErrors = Record<string, string[]>;

export type ReservationValues = {
  fullName: string;
  email: string;
  phone: string;
  acceptTerms: boolean;
  marketingConsent: boolean;
  answers: Record<string, AnswerValue>;
};

export const emptyValues: ReservationValues = { fullName: "", email: "", phone: "", acceptTerms: false, marketingConsent: false, answers: {} };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d\s().-]*$/;
const REQUIRED = "Esta pregunta es obligatoria.";

export function answerKey(questionId: string) {
  return `answers.${questionId}`;
}

export function isAnswered(question: QuestionDefinition, value: AnswerValue | undefined): boolean {
  switch (question.type) {
    case "text":
    case "textarea":
      return typeof value === "string" && value.trim().length > 0;
    case "select":
      return typeof value === "string" && value.length > 0;
    case "multiselect":
      return Array.isArray(value) && value.length > 0;
    case "boolean":
      return value === true;
  }
}

/** Valida un solo campo por su clave ("fullName", "answers.<id>", …). Devuelve los mensajes o []. */
export function validateField(key: string, values: ReservationValues, questions: QuestionDefinition[]): string[] {
  switch (key) {
    case "fullName":
      return values.fullName.trim().length >= 2 ? [] : ["Escribe tu nombre completo."];
    case "email":
      return EMAIL.test(values.email.trim()) ? [] : ["Correo no válido."];
    case "phone":
      return PHONE.test(values.phone) && values.phone.length <= 30 ? [] : ["Teléfono no válido."];
    case "acceptTerms":
      return values.acceptTerms ? [] : ["Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar."];
  }
  const question = questions.find((q) => answerKey(q.id) === key);
  if (!question || !question.required) return [];
  return isAnswered(question, values.answers[question.id]) ? [] : [REQUIRED];
}

export function validateReservation(values: ReservationValues, questions: QuestionDefinition[]): FieldErrors {
  const keys = ["fullName", "email", "phone", ...questions.map((q) => answerKey(q.id)), "acceptTerms"];
  const errors: FieldErrors = {};
  for (const key of keys) {
    const messages = validateField(key, values, questions);
    if (messages.length) errors[key] = messages;
  }
  return errors;
}

/** Progreso por sección para el resumen lateral. */
export function progress(values: ReservationValues, questions: QuestionDefinition[]) {
  const required = questions.filter((q) => q.required);
  const answered = required.filter((q) => isAnswered(q, values.answers[q.id])).length;
  // Con solo preguntas opcionales, la sección cuenta como completa cuando se responde al menos una.
  const anyAnswered = questions.some((q) => isAnswered(q, values.answers[q.id]));
  return {
    contact: validateField("fullName", values, questions).length === 0 && validateField("email", values, questions).length === 0,
    questions: { answered, total: required.length, done: answered === required.length && (required.length > 0 || anyAnswered) },
    confirm: values.acceptTerms,
  };
}
