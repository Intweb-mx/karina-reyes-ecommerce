import { business, LEGAL_UPDATED } from "./business.ts";
import type { LegalDocument } from "./types.ts";

/** Fuente: ENVIOS.pdf (30 de septiembre de 2026). Texto aprobado por el cliente; no editar sin su autorización. */
export const envios: LegalDocument = {
  slug: "envios-y-recoleccion",
  shortTitle: "Envíos y Recolección",
  title: ["Política de Envíos,", "Entregas y Recolección"],
  updated: `inttimo · Última actualización: ${LEGAL_UPDATED}`,
  intro: ["Esta política describe las condiciones operativas aplicables a la preparación, envío, entrega y recolección de productos adquiridos a través de inttimo."],
  sections: [
    {
      title: "1. Alcance",
      paragraphs: ["Esta política aplica a las compras de productos físicos realizadas directamente a través de inttimo, incluyendo la preventa de UNO+UNO."],
    },
    {
      title: "2. Preventa UNO+UNO",
      paragraphs: [
        "La preventa de UNO+UNO estará disponible del 1 al 15 de octubre de 2026, o hasta agotar existencias. Los pedidos de preventa tendrán prioridad de preparación y despacho, con el objetivo operativo de que sean recibidos antes del lanzamiento oficial del 26 de octubre de 2026. Los tiempos de tránsito de las empresas de mensajería pueden variar por destino, cobertura o circunstancias ajenas a inttimo.",
      ],
    },
    {
      title: "3. Preparación de pedidos",
      paragraphs: [
        "Una vez confirmado el pago, el pedido quedará registrado para preparación. inttimo buscará preparar los pedidos en un plazo máximo de 24 horas a partir del momento en que el inventario esté disponible para entrega, procurando procesarlos el mismo día cuando sea operativamente posible.",
      ],
    },
    {
      title: "4. Envíos dentro de México",
      paragraphs: [
        "En esta primera etapa, los envíos automatizados estarán disponibles dentro de la República Mexicana. El comprador deberá proporcionar una dirección completa y correcta. Antes de finalizar la compra se mostrará el costo de envío cuando la cotización automática esté disponible.",
      ],
    },
    {
      title: "5. Costo del envío",
      paragraphs: [
        "El costo de mensajería será cubierto por el comprador. inttimo no ofrece envío gratuito como condición general de esta preventa. El sistema buscará mostrar una alternativa económica disponible y, cuando exista, una opción Express adicional para que el comprador pueda elegir.",
      ],
    },
    {
      title: "6. Plataforma logística",
      paragraphs: [
        "La gestión logística podrá realizarse mediante SkyDropX y las empresas transportistas disponibles a través de dicha plataforma. La paquetería final puede variar de acuerdo con destino, cobertura, precio y servicio seleccionado.",
      ],
    },
    {
      title: "7. Rastreo",
      paragraphs: [
        "Cuando el pedido sea entregado a la empresa transportista y exista una guía activa, el comprador recibirá la información de rastreo disponible mediante correo electrónico u otro canal de contacto proporcionado durante la compra.",
      ],
    },
    {
      title: "8. Recolección sin costo en Chihuahua",
      paragraphs: [
        "Los compradores ubicados en Chihuahua podrán seleccionar recolección sin costo de envío. inttimo podrá habilitar entregas programadas en puntos como Costco y, en determinados domingos, Iglesia Baluarte. El punto, fecha, horario e instrucciones aplicables serán comunicados después de la compra. El cliente deberá esperar la confirmación de que su pedido está LISTO PARA RECOGER antes de acudir.",
      ],
    },
    {
      title: "9. Identificación para recolección",
      paragraphs: [
        "Para entregar el pedido podrá solicitarse nombre del comprador, número de pedido o comprobante de compra. Si otra persona recogerá el producto, el comprador deberá comunicarlo previamente cuando sea necesario.",
      ],
    },
    {
      title: "10. Dirección incorrecta o incompleta",
      paragraphs: [
        "El comprador es responsable de revisar los datos de envío antes de pagar. Si una entrega no puede realizarse por información incorrecta, incompleta o desactualizada proporcionada por el comprador, inttimo contactará al cliente para revisar alternativas. Un segundo envío originado por datos incorrectos podrá generar un nuevo costo de mensajería, que deberá informarse antes de realizarlo.",
      ],
    },
    {
      title: "11. Retrasos de paquetería",
      paragraphs: [
        "Una vez entregado el paquete a la transportista, pueden presentarse retrasos por alta demanda, cobertura, clima, incidencias operativas, caso fortuito, fuerza mayor u otras circunstancias ajenas a inttimo. inttimo dará seguimiento a las incidencias que sean reportadas, sin atribuir al comprador costos que no le correspondan legalmente.",
      ],
    },
    {
      title: "12. Paquete extraviado",
      paragraphs: [
        "Si la empresa de mensajería confirma el extravío de un pedido, inttimo revisará el caso y gestionará la solución correspondiente. Cuando proceda, podrá realizarse la reposición del producto sin cobrar nuevamente al comprador la unidad extraviada.",
      ],
    },
    {
      title: "13. Producto recibido con daño",
      paragraphs: [
        "Si el producto llega físicamente dañado, el comprador deberá contactar a inttimo indicando nombre, número de pedido, descripción del problema y evidencia fotográfica. Para agilizar la atención se solicita reportarlo dentro de los 15 días naturales posteriores a la recepción. La solución se determinará conforme al caso y a los derechos que correspondan al consumidor.",
      ],
    },
    {
      title: "14. Envíos internacionales",
      paragraphs: [
        "Los envíos fuera de México no forman parte del proceso automatizado inicial. Las solicitudes para Estados Unidos u otros países deberán consultarse directamente con inttimo y serán revisadas individualmente. La posibilidad de envío, precio, impuestos, restricciones y tiempos se informarán antes de confirmar cualquier operación internacional.",
      ],
    },
    {
      title: "15. Comunicaciones",
      paragraphs: [
        "El comprador podrá recibir correos o mensajes operativos relacionados con confirmación de compra, preparación, generación de guía, envío, rastreo, recolección, incidencias y entrega. Estas comunicaciones forman parte de la administración del pedido.",
      ],
    },
    {
      title: "16. Contacto",
      paragraphs: [`Correo: ${business.email}. WhatsApp: ${business.whatsapp}. Horario de atención: ${business.hours}. Tiempo objetivo de respuesta: ${business.responseTime}.`],
    },
  ],
};
