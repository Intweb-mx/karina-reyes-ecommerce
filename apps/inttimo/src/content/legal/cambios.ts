import { business, LEGAL_UPDATED } from "./business.ts";
import type { LegalDocument } from "./types.ts";

/** Fuente: CAMBIOS_REEMBOLSOS.pdf (30 de septiembre de 2026). Texto aprobado por el cliente; no editar sin su autorización. */
export const cambios: LegalDocument = {
  slug: "cambios-y-reembolsos",
  shortTitle: "Cambios y Reembolsos",
  title: ["Política de Cambios,", "Daños, Cancelaciones y Reembolsos"],
  updated: `inttimo · Última actualización: ${LEGAL_UPDATED}`,
  intro: ["Esta política establece el procedimiento de atención aplicable cuando exista una incidencia con una compra realizada directamente a través de inttimo."],
  sections: [
    {
      title: "1. Alcance",
      paragraphs: ["Esta política aplica a las compras de productos físicos realizadas directamente a través de inttimo, incluyendo las compras efectuadas durante la preventa de UNO+UNO."],
    },
    {
      title: "2. Producto recibido con daño",
      paragraphs: [
        "Si el producto llega físicamente dañado, incompleto o presenta una afectación atribuible al traslado o entrega, el comprador deberá contactar a inttimo proporcionando su nombre, número de pedido, descripción del problema y evidencia fotográfica. Para agilizar la atención se solicita realizar el reporte dentro de los 15 días naturales posteriores a la recepción. Esta solicitud operativa no limita los derechos que correspondan al consumidor conforme a la legislación aplicable.",
      ],
    },
    {
      title: "3. Reposición por daño",
      paragraphs: [
        "Una vez revisado el caso, inttimo podrá gestionar la reposición total o parcial del producto, cambio, reembolso u otra solución que corresponda. Cuando el daño sea imputable al producto, preparación o transporte y proceda la reposición, el comprador no deberá pagar nuevamente por la unidad afectada.",
      ],
    },
    {
      title: "4. Producto extraviado durante el envío",
      paragraphs: [
        "Cuando una empresa transportista confirme el extravío de un pedido, inttimo dará seguimiento al caso y gestionará la solución correspondiente. Cuando proceda, podrá realizarse la reposición del producto sin cobrar nuevamente al comprador la unidad extraviada, o aplicarse otra solución conforme al caso y a la legislación aplicable.",
      ],
    },
    {
      title: "5. Producto incorrecto o pedido incompleto",
      paragraphs: [
        "Si el comprador recibe un producto distinto al solicitado o una cantidad menor a la confirmada en su pedido, deberá contactar a inttimo con los datos y evidencia correspondientes. Una vez verificada la incidencia, inttimo gestionará el envío de lo faltante, la sustitución o la solución que corresponda sin trasladar al comprador costos derivados de un error atribuible a inttimo.",
      ],
    },
    {
      title: "6. Cancelaciones antes del envío",
      paragraphs: [
        "Las solicitudes de cancelación recibidas antes de que el pedido haya sido preparado, entregado a paquetería o puesto a disposición para recolección serán revisadas individualmente. Cuando legal y operativamente proceda la cancelación, se gestionará el reembolso correspondiente por el medio disponible.",
      ],
    },
    {
      title: "7. Preventa",
      paragraphs: [
        "Comprar durante la preventa significa adquirir un producto que será preparado y entregado conforme al calendario operativo informado. La condición de preventa no elimina los derechos que la legislación aplicable reconozca al consumidor en materia de cancelación, revocación, incumplimiento, devolución, garantía o reembolso.",
      ],
    },
    {
      title: "8. Revocación y devoluciones",
      paragraphs: [
        "Las solicitudes de revocación o devolución serán atendidas conforme a la Ley Federal de Protección al Consumidor y demás disposiciones aplicables. inttimo no establecerá una prohibición absoluta de devoluciones cuando exista un derecho legalmente aplicable. Cada solicitud será revisada considerando el estado del pedido, la naturaleza del producto y las circunstancias de la operación.",
      ],
    },
    {
      title: "9. Condiciones del producto en una devolución",
      paragraphs: [
        "Cuando una devolución proceda y la naturaleza del caso permita exigir la devolución física del producto, inttimo informará al comprador las instrucciones correspondientes. Las condiciones, costos y forma de retorno se determinarán conforme al motivo de la devolución y a la legislación aplicable.",
      ],
    },
    {
      title: "10. Reembolsos",
      paragraphs: [
        "Cuando un reembolso resulte procedente, inttimo realizará la gestión correspondiente utilizando el medio técnicamente disponible y compatible con la operación original. El tiempo para que el importe se refleje puede depender de Stripe, del banco emisor, de la institución financiera y del método de pago utilizado.",
      ],
    },
    {
      title: "11. Duplicidad de cobro",
      paragraphs: [
        "Si el comprador identifica un posible cobro duplicado deberá contactar a inttimo proporcionando los datos del pedido y evidencia disponible. inttimo verificará la operación y, si se confirma un cargo duplicado atribuible al proceso de compra, gestionará la corrección o reembolso correspondiente.",
      ],
    },
    {
      title: "12. Dirección incorrecta o falta de recepción",
      paragraphs: [
        "Cuando un pedido no pueda entregarse por datos incorrectos, incompletos o desactualizados proporcionados por el comprador, o por causas atribuibles a la recepción, inttimo contactará al cliente para revisar alternativas. Un nuevo envío podrá generar un costo adicional de mensajería cuando dicho costo derive de información o circunstancias atribuibles al comprador, previa comunicación del importe.",
      ],
    },
    {
      title: "13. Recolección en Chihuahua",
      paragraphs: [
        "Los pedidos seleccionados para recolección deberán recogerse conforme a las instrucciones enviadas por inttimo una vez que el pedido esté marcado como LISTO PARA RECOGER. Si el comprador no puede acudir, deberá contactar a inttimo para revisar una alternativa de entrega o nueva fecha. Cualquier cambio que implique mensajería podrá generar el costo correspondiente, informado previamente.",
      ],
    },
    {
      title: "14. Bonus digital de preventa",
      paragraphs: [
        "El bonus digital de preventa —PDF y video especial— es un beneficio complementario para las compras elegibles realizadas durante el periodo anunciado. Su acceso no sustituye los derechos asociados al producto físico. Debido a su naturaleza digital y de acceso personal, cualquier incidencia relacionada con el enlace o acceso deberá reportarse a inttimo para su revisión.",
      ],
    },
    {
      title: "15. Cómo solicitar atención",
      paragraphs: [
        "Para solicitar cambio, reposición, cancelación, devolución o reembolso, el comprador deberá contactar a inttimo e indicar, según corresponda: nombre completo, número de pedido, correo o teléfono utilizado en la compra, motivo de la solicitud y evidencia fotográfica cuando exista daño, producto incorrecto o pedido incompleto.",
      ],
    },
    {
      title: "16. Canal y horario de atención",
      paragraphs: [`Correo: ${business.email}. WhatsApp: ${business.whatsapp}. Horario de atención: ${business.hours}. Tiempo objetivo de respuesta: ${business.responseTime}.`],
    },
    {
      title: "17. Derechos del consumidor",
      paragraphs: [
        "Ninguna disposición de esta política pretende excluir, reducir o limitar derechos irrenunciables reconocidos al consumidor por la legislación mexicana aplicable. En caso de contradicción entre esta política y una disposición legal obligatoria, prevalecerá esta última.",
      ],
    },
  ],
};
