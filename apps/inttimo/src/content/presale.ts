/*
 * Textos de interfaz de la preventa (microcopy). No contiene datos de negocio:
 * nombre, precio, fechas, nota de entrega, preguntas y términos vienen de la campaña (API).
 */
import type { PresalePhase, PublicReservationStatus } from "@/server/presale/contract";

export const phaseCopy: Record<PresalePhase, { badge: string; lede: string; countdownLabel?: string }> = {
  open: { badge: "Preventa abierta", lede: "Aparta el tuyo antes que nadie.", countdownLabel: "La preventa cierra en" },
  upcoming: { badge: "Próximamente", lede: "La preventa abre muy pronto.", countdownLabel: "La preventa abre en" },
  closed: { badge: "Preventa cerrada", lede: "La preventa ha terminado." },
};

export const steps = (hasQuestions: boolean) => [
  { title: "Completa tus datos", body: hasQuestions ? "Tu nombre, tu correo y un breve cuestionario." : "Tu nombre y tu correo; toma un par de minutos." },
  { title: "Paga de forma segura", body: "Pagas el precio completo en la página segura de Stripe." },
  { title: "Recibe tu folio", body: "Te enviamos un correo con tu folio de reserva. Guárdalo como comprobante." },
];

export const trust = [
  { key: "lock", title: "Pago cifrado", body: "Procesado por Stripe. No guardamos datos de tu tarjeta." },
  { key: "mail", title: "Confirmación por correo", body: "Recibes tu folio en cuanto se confirma el pago." },
  { key: "receipt", title: "Folio único", body: "Cada reserva tiene un folio que funciona como comprobante." },
] as const;

export const formCopy = {
  title: "Reserva tu lugar",
  intro: "Al terminar te llevaremos a Stripe para pagar. Tu lugar queda reservado cuando el pago se confirma.",
  sections: { contact: "Tus datos", questions: "Cuestionario", confirm: "Confirmación" },
  submit: "Reservar y pagar",
  submitting: "Preparando pago…",
  redirecting: "Redirigiendo a Stripe…",
  secureNote: "Te llevaremos a Stripe para pagar de forma segura. No guardamos datos de tu tarjeta.",
  errorSummaryTitle: (count: number) => (count === 1 ? "Hay 1 dato por corregir" : `Hay ${count} datos por corregir`),
  networkError: "No pudimos enviar tu reserva. Revisa tu conexión e inténtalo de nuevo.",
  termsUpdated: "Los términos se actualizaron. Revísalos y vuelve a aceptarlos para continuar.",
};

export const stateCopy = {
  notReady: { title: "La preventa estará disponible en breve.", body: "Estamos terminando los últimos detalles. Vuelve a esta página en unos minutos." },
  upcoming: (date: string) => ({ title: "La preventa aún no abre.", body: `Abre el ${date}; si mantienes esta página abierta, se actualizará sola al llegar la hora.` }),
  closed: { title: "La preventa ha cerrado.", body: "Gracias por tu interés. Ya no es posible reservar en esta campaña." },
  canceled: "Tu lugar no quedó reservado; puedes intentarlo de nuevo cuando quieras.",
};

export type Tone = "success" | "pending" | "failed" | "neutral";

export const statusCopy: Record<PublicReservationStatus, { eyebrow: string; title: string; body: string; tone: Tone }> = {
  paid: { eyebrow: "Gracias por tu reserva", title: "Tu lugar está reservado.", body: "Te enviamos un correo con tu folio. Guárdalo como comprobante.", tone: "success" },
  processing: {
    eyebrow: "Pago en proceso",
    title: "Casi listo.",
    body: "Tu reserva se confirma en cuanto se acredite el pago (por ejemplo, al pagar tu ficha en OXXO). Te avisaremos por correo.",
    tone: "pending",
  },
  pending_payment: { eyebrow: "Un momento", title: "Confirmando tu pago…", body: "Esto tarda unos segundos. No cierres esta página.", tone: "pending" },
  payment_failed: { eyebrow: "Pago no completado", title: "El pago no se completó.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo.", tone: "failed" },
  expired: { eyebrow: "Sesión expirada", title: "La sesión de pago expiró.", body: "Tu lugar no quedó reservado. Puedes intentarlo de nuevo.", tone: "failed" },
  canceled: { eyebrow: "Reserva cancelada", title: "La reserva se canceló.", body: "Puedes intentarlo de nuevo.", tone: "failed" },
  refunded: { eyebrow: "Reembolso", title: "Reserva reembolsada.", body: "El reembolso se procesó a tu método de pago.", tone: "neutral" },
};

export const slowPaymentCopy = {
  title: "Seguimos confirmando tu pago.",
  body: "Si ya pagaste, recibirás un correo en cuanto se confirme. No es necesario pagar de nuevo.",
};
