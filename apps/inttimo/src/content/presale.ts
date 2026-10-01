/*
 * Textos de interfaz de la preventa (microcopy), con el enfoque de COMPRA en preventa
 * (brief "Cambios preventa UNO+UNO", 30 sep 2026): nada de "reservar un lugar".
 * No contiene datos de negocio: nombre, precio, fechas, cantidad máxima, preguntas y términos vienen de la campaña (API);
 * el contenido del producto vive en src/content/products.ts.
 */
import type { PresalePhase, PublicReservationStatus } from "@/server/presale/contract";

export const phaseCopy: Record<PresalePhase, { badge: string; lede: string; countdownLabel?: string }> = {
  open: { badge: "Preventa abierta", lede: "Sé de los primeros en tenerlo.", countdownLabel: "Quedan" },
  upcoming: { badge: "Próximamente", lede: "La preventa abre muy pronto.", countdownLabel: "Abre en" },
  closed: { badge: "Preventa cerrada", lede: "La preventa ha terminado." },
};

/** Pasos de "Cómo funciona tu preventa". Cantidad, duración y lanzamiento salen de la campaña y del contenido del producto. */
export function steps({ productName, maxQuantity, days, launch }: { productName: string; maxQuantity: number; days: number; launch?: string }) {
  const units = maxQuantity > 1 ? `una o hasta ${maxQuantity === 2 ? "dos" : maxQuantity} unidades` : "tu unidad";
  return [
    { title: `Elige tu ${productName}`, body: `Selecciona ${units} durante los ${days} días de preventa.` },
    { title: "Realiza tu compra", body: "Paga de forma segura con tarjeta a través de Stripe." },
    {
      title: "Recíbelo primero",
      body: launch ? `Tu pedido queda registrado para el lanzamiento oficial del ${launch}.` : "Tu pedido queda registrado para el lanzamiento oficial.",
    },
  ];
}

export const trust = [
  { key: "lock", title: "Compra segura", body: "Tu pago es procesado de forma segura por Stripe." },
  { key: "mail", title: "Confirmación inmediata", body: "Recibirás por correo la confirmación y los datos de tu compra." },
  { key: "box", title: "Preventa registrada", body: "Tu pedido quedará registrado dentro de esta primera preventa." },
] as const;

export const formCopy = {
  eyebrow: "Preventa",
  title: (productName: string) => `Quiero mi ${productName}`,
  intro: "Completa tus datos para realizar tu compra de preventa. Al continuar, te llevaremos a Stripe para efectuar el pago de forma segura.",
  sections: { contact: "Tus datos", questions: "Cuéntanos un poco", confirm: "Confirma tu compra" },
  questionsIntro: "Nos ayuda a conocerte mejor. Solo toma unos segundos.",
  submit: (productName: string) => `Pagar mi ${productName}`,
  submitShort: "Pagar",
  submitting: "Preparando pago…",
  redirecting: "Redirigiendo a Stripe…",
  secureNote: "Pago seguro procesado por Stripe. No guardamos datos de tu tarjeta.",
  errorSummaryTitle: (count: number) => (count === 1 ? "Hay 1 dato por corregir" : `Hay ${count} datos por corregir`),
  networkError: "No pudimos continuar con tu compra. Revisa tu conexión e inténtalo de nuevo.",
  termsUpdated: "Los términos se actualizaron. Revísalos y vuelve a aceptarlos para continuar.",
};

/** Avisos cortos obligatorios del checkout ("Implementación legal en web", §5, §6 y §11). */
export const legalNotice = {
  dataUse: "Tus datos serán utilizados para procesar tu compra, gestionar tu pedido, entrega y atención. Consulta nuestro",
  shippingLink: "Consulta nuestra Política de Envíos y Recolección",
  invoice: "¿Requieres factura? Solicítala después de realizar tu compra.",
  priority: "Los pedidos de preventa tendrán prioridad de preparación y entrega, con el objetivo de ser recibidos antes del lanzamiento oficial, sujeto a logística y paquetería.",
  stock: (units: number) => `Disponibilidad limitada: hasta ${units} unidades en esta preventa.`,
  period: (range: string) => `Preventa: ${range}, o hasta agotar existencias.`,
};

/**
 * Opciones de entrega del checkout. Redacción alineada con Términos §9–10 y Envíos §8 (content/legal);
 * costo y disponibilidad de cada opción vienen de la campaña (campaign.delivery).
 */
export const deliveryCopy = {
  sectionTitle: "Entrega",
  sectionIntro: "Elige cómo quieres recibir tu pedido.",
  pickup: {
    title: "Recolección en Chihuahua",
    price: "Sin costo",
    body: "Para compradores en Chihuahua. Te avisaremos el punto (como Costco o, en determinados domingos, Iglesia Baluarte), la fecha y el horario cuando tu pedido esté LISTO PARA RECOGER.",
    summary: "Recolección en Chihuahua",
  },
  shipping: {
    title: "Envío a domicilio",
    pricePending: "Costo por cotizar",
    body: "Dentro de la República Mexicana. Stripe te pedirá tu dirección completa al pagar.",
    bodyPending: "Dentro de la República Mexicana. Stripe te pedirá tu dirección completa al pagar. El envío lo cubre el comprador: te confirmaremos su costo; no se incluye en este pago.",
    summary: "Envío a domicilio",
  },
  free: "Sin costo",
  pending: "Por cotizar",
  policyLink: "Consulta nuestra Política de Envíos y Recolección",
};

export const stateCopy = {
  notReady: { title: "La preventa estará disponible en breve.", body: "Estamos terminando los últimos detalles. Vuelve a esta página en unos minutos." },
  upcoming: (date: string) => ({ title: "La preventa aún no abre.", body: `Abre el ${date}; si mantienes esta página abierta, se actualizará sola al llegar la hora.` }),
  closed: { title: "La preventa ha cerrado.", body: "Gracias por tu interés. Ya no es posible comprar en esta preventa." },
  soldOut: { title: "Las unidades de preventa se agotaron.", body: "Gracias por tu interés. Ya no hay unidades disponibles en esta preventa." },
  /** Panel del hero cuando la campaña agotó su tope de unidades (campaign.soldOut). */
  soldOutCard: { badge: "Agotado", title: "Agotado", body: "Se vendieron todas las unidades de esta preventa." },
  canceled: "No se realizó ningún cargo y tu compra no se completó. Puedes intentarlo de nuevo cuando quieras.",
};

export type Tone = "success" | "pending" | "failed" | "neutral";

export const statusCopy: Record<PublicReservationStatus, { eyebrow: string; title: string; body: string; tone: Tone }> = {
  paid: { eyebrow: "Gracias por tu compra", title: "Tu compra de preventa está confirmada.", body: "Te enviamos un correo con tu folio de compra. Guárdalo como comprobante.", tone: "success" },
  processing: {
    eyebrow: "Pago en proceso",
    title: "Casi listo.",
    body: "Tu compra se confirma en cuanto se acredite el pago (por ejemplo, al pagar tu ficha en OXXO). Te avisaremos por correo.",
    tone: "pending",
  },
  pending_payment: { eyebrow: "Un momento", title: "Confirmando tu pago…", body: "Esto tarda unos segundos. No cierres esta página.", tone: "pending" },
  payment_failed: { eyebrow: "Pago no completado", title: "El pago no se completó.", body: "Tu compra no se realizó. Puedes intentarlo de nuevo.", tone: "failed" },
  expired: { eyebrow: "Sesión expirada", title: "La sesión de pago expiró.", body: "Tu compra no se realizó. Puedes intentarlo de nuevo.", tone: "failed" },
  canceled: { eyebrow: "Compra cancelada", title: "La compra se canceló.", body: "Puedes intentarlo de nuevo.", tone: "failed" },
  refunded: { eyebrow: "Reembolso", title: "Compra reembolsada.", body: "El reembolso se procesó a tu método de pago.", tone: "neutral" },
};

/** Encabezado de la confirmación cuando el pedido pagado ya avanzó en la entrega (fulfillmentStatus). */
export const fulfillmentCopy = {
  ready_for_pickup: { eyebrow: "Listo para recoger", title: "Tu pedido está listo para recoger.", body: "Te enviamos por correo el punto, la fecha y el horario de recolección." },
  shipped: { eyebrow: "En camino", title: "Tu pedido va en camino.", body: "Puedes seguir tu envío con la guía de rastreo." },
  delivered: { eyebrow: "Entregado", title: "Tu pedido fue entregado.", body: "Gracias por ser parte de esta preventa." },
} as const;

export const slowPaymentCopy = {
  title: "Seguimos confirmando tu pago.",
  body: "Si ya pagaste, recibirás un correo en cuanto se confirme. No es necesario pagar de nuevo.",
};
