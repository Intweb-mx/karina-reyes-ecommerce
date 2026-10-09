import { business } from "./business.ts";
import type { LegalDocument } from "./types.ts";

const TERMS_UPDATED = "9 de octubre de 2026";

/** Fuente: TERMINOS_UNO_UNO.pdf (30 de septiembre de 2026). Texto aprobado por el cliente; no editar sin su autorización. Cláusula 19 actualizada y aprobada el 9 de octubre de 2026 (bonus al entregar). */
export const terminos: LegalDocument = {
  slug: "terminos-y-condiciones",
  shortTitle: "Términos y Condiciones",
  title: ["Términos y Condiciones", "Preventa UNO+UNO"],
  updated: `inttimo · Última actualización: ${TERMS_UPDATED}`,
  facts: [
    { label: "Proveedor", value: `${business.legalName}, ${business.legalNature}.` },
    { label: "Domicilio", value: `${business.address}.` },
    { label: "Contacto", value: `${business.email} · WhatsApp ${business.whatsapp}` },
  ],
  intro: [
    "Estos Términos y Condiciones regulan la compra en preventa del producto UNO+UNO, comercializado bajo la marca inttimo. Al realizar una compra, el cliente declara haber leído y aceptado las condiciones aplicables.",
  ],
  sections: [
    {
      title: "1. Naturaleza de la preventa",
      paragraphs: [
        "La adquisición de UNO+UNO durante el periodo de preventa constituye una compra real de un producto físico, no una reservación de lugar, registro de interés ni participación en un sorteo. La compra se considerará confirmada cuando el pago haya sido procesado y autorizado correctamente.",
      ],
    },
    {
      title: "2. Periodo de preventa",
      paragraphs: [
        "La preventa estará disponible del 1 al 15 de octubre de 2026, o hasta agotar las unidades destinadas a esta etapa, lo que ocurra primero. El lanzamiento oficial de UNO+UNO está programado para el 26 de octubre de 2026.",
      ],
    },
    {
      title: "3. Beneficio de comprar en preventa",
      paragraphs: [
        "Los pedidos realizados durante la preventa tendrán prioridad de preparación, envío y entrega, con el objetivo de que los compradores reciban UNO+UNO antes del lanzamiento oficial del 26 de octubre de 2026. inttimo realizará los esfuerzos operativos razonables para cumplir este objetivo. Los tiempos específicos pueden variar por destino, cobertura, incidencias de mensajería, información incorrecta proporcionada por el comprador, caso fortuito, fuerza mayor u otras circunstancias fuera del control directo de inttimo.",
      ],
    },
    {
      title: "4. Producto",
      paragraphs: [
        "UNO+UNO es una experiencia de conversación física para parejas y matrimonios. Las imágenes publicadas tienen como finalidad mostrar el producto ofrecido. Pueden existir variaciones menores derivadas de iluminación, pantalla o fotografía que no alteren las características esenciales del producto.",
      ],
    },
    {
      title: "5. Precio",
      paragraphs: [
        "El precio publicado para esta preventa es de $500.00 MXN por unidad. Antes de confirmar la compra, el cliente podrá consultar la cantidad seleccionada, costo del producto, costo de envío cuando corresponda y monto total de la operación.",
      ],
    },
    {
      title: "6. Disponibilidad e inventario",
      paragraphs: [
        "La preventa inicia con una disponibilidad de hasta 500 unidades. La compra está sujeta a existencia. El cliente podrá adquirir más de una unidad siempre que exista inventario suficiente. Una vez agotado el inventario, inttimo podrá cerrar la venta o habilitar una lista de espera o registro de interés.",
      ],
    },
    {
      title: "7. Pago",
      paragraphs: [
        "Los pagos electrónicos serán procesados mediante Stripe. La compra quedará confirmada únicamente después de que el pago sea autorizado. El comprador recibirá una confirmación mediante los datos proporcionados durante el proceso de compra. inttimo no almacena directamente los datos completos de la tarjeta utilizada para efectuar el pago.",
      ],
    },
    {
      title: "8. Datos del comprador",
      paragraphs: [
        "Para procesar la compra se podrá solicitar nombre completo, correo electrónico, teléfono o WhatsApp, cantidad de productos y, cuando corresponda, la información necesaria para efectuar el envío. El comprador es responsable de proporcionar información completa, actualizada y correcta. El tratamiento de estos datos estará sujeto al Aviso de Privacidad de inttimo.",
      ],
    },
    {
      title: "9. Recolección en Chihuahua",
      paragraphs: [
        "El comprador podrá seleccionar recolección en Chihuahua sin costo de envío. Se establecerán puntos y horarios programados de entrega, incluyendo opciones como Costco y, en determinados días, Iglesia Baluarte. Después de la compra se proporcionarán por correo electrónico o WhatsApp las instrucciones correspondientes para recoger UNO+UNO.",
      ],
    },
    {
      title: "10. Envío a domicilio",
      paragraphs: [
        "Cuando el comprador seleccione envío a domicilio deberá proporcionar los datos necesarios para la entrega. El costo del envío será cubierto por el comprador y deberá mostrarse antes de concluir el pago cuando la cotización automática se encuentre disponible. La integración logística podrá realizarse mediante SkyDropX y los servicios de mensajería disponibles a través de dicha plataforma.",
      ],
    },
    {
      title: "11. Cobertura",
      paragraphs: [
        "En esta primera etapa, los envíos automatizados estarán disponibles dentro de la República Mexicana. Los envíos fuera de México no forman parte del proceso automatizado de esta preventa. Las solicitudes internacionales deberán revisarse individualmente y podrán estar sujetas a costos, restricciones y condiciones adicionales.",
      ],
    },
    {
      title: "12. Preparación, envío y entrega",
      paragraphs: [
        "Los pedidos de preventa serán procesados prioritariamente. La planeación operativa contempla realizar entregas y envíos durante octubre, buscando que los compradores reciban el producto antes del lanzamiento oficial del 26 de octubre de 2026. Los tiempos proporcionados por empresas de mensajería son estimados y pueden variar por causas ajenas a inttimo.",
      ],
    },
    {
      title: "13. Seguimiento",
      paragraphs: [
        "Cuando el pedido sea enviado mediante paquetería y exista información de rastreo disponible, el comprador recibirá los datos correspondientes. Para pedidos con recolección en Chihuahua, el cliente recibirá información sobre el punto, fecha u horario aplicable.",
      ],
    },
    {
      title: "14. Dirección incorrecta o incompleta",
      paragraphs: [
        "El comprador deberá verificar su información antes de concluir la operación. Si una entrega no puede realizarse por información incorrecta, incompleta o desactualizada proporcionada por el comprador, inttimo contactará al cliente para determinar las alternativas disponibles. Un segundo envío por causas atribuibles a datos incorrectos podrá generar nuevos costos de mensajería, los cuales deberán informarse previamente.",
      ],
    },
    {
      title: "15. Producto dañado",
      paragraphs: [
        "Si UNO+UNO llega físicamente dañado, el comprador deberá contactar a inttimo y proporcionar número de pedido, nombre del comprador, descripción del problema y evidencia del daño. Para efectos operativos, se solicita reportar estas incidencias dentro de los 15 días naturales posteriores a la recepción. Una vez revisado el caso, se determinará la reposición, cambio, reembolso u otra solución que corresponda, sin limitar los derechos que reconozca la legislación aplicable.",
      ],
    },
    {
      title: "16. Producto extraviado",
      paragraphs: [
        "Si la empresa de mensajería confirma el extravío de un pedido, inttimo revisará el caso y gestionará la solución correspondiente. Cuando proceda, podrá realizarse la reposición del producto sin que el comprador tenga que pagar nuevamente por la unidad extraviada.",
      ],
    },
    {
      title: "17. Cancelaciones, devoluciones y reembolsos",
      paragraphs: [
        "Las cancelaciones, devoluciones, revocaciones y reembolsos serán atendidos conforme a la legislación mexicana aplicable en materia de protección al consumidor. Nada de lo establecido en estos términos pretende eliminar o restringir derechos irrenunciables que correspondan legalmente al consumidor. Cuando un reembolso resulte procedente, inttimo realizará las gestiones correspondientes; el tiempo de reflejo podrá depender también de Stripe, del banco emisor y del medio de pago utilizado.",
      ],
    },
    {
      title: "18. Bonus exclusivo de preventa",
      paragraphs: [
        "Las compras confirmadas del 1 al 15 de octubre de 2026 serán elegibles para recibir un bonus digital exclusivo compuesto por una guía en PDF y un video especial de Karina. El contenido complementa la experiencia de UNO+UNO y no tiene valor canjeable en efectivo ni puede intercambiarse por descuento u otro producto.",
      ],
    },
    {
      title: "19. Entrega y vigencia del bonus",
      paragraphs: [
        "El bonus no se entrega inmediatamente después del pago. El acceso se libera cuando el pedido se registra como entregado: en pedidos enviados por paquetería, cuando la paquetería confirma la entrega; en recolección en Chihuahua, cuando el comprador recibe el producto en el punto acordado. El comprador recibirá por correo un enlace temporal y único para acceder al PDF y al video. La vigencia del enlace será informada en el correo correspondiente.",
      ],
    },
    {
      title: "20. Uso del contenido digital",
      paragraphs: [
        "El PDF, video y demás materiales del bonus están destinados al uso personal del comprador. La compra no implica cesión de derechos de propiedad intelectual. No está permitida su reproducción, comercialización, distribución pública o explotación comercial sin autorización.",
      ],
    },
    {
      title: "21. Facturación",
      paragraphs: [
        "El comprador que requiera comprobante fiscal podrá solicitarlo después de realizar su compra proporcionando la información fiscal correspondiente. La emisión del comprobante se realizará conforme a las disposiciones fiscales aplicables. La información fiscal y el RFC del proveedor se incorporarán al proceso correspondiente conforme quede validada la configuración fiscal.",
      ],
    },
    {
      title: "22. Comunicaciones del pedido",
      paragraphs: [
        "Al realizar una compra, el comprador acepta recibir comunicaciones necesarias para gestionar la transacción, incluyendo confirmación de pago, información del pedido, instrucciones de recolección, información de envío, rastreo, incidencias y acceso al bonus cuando corresponda. Estas comunicaciones operativas son distintas de comunicaciones publicitarias o promocionales.",
      ],
    },
    {
      title: "23. Cuestionario posterior a la compra",
      paragraphs: [
        "Después de realizar la compra, inttimo podrá invitar al cliente a responder un cuestionario voluntario relacionado con su experiencia o motivaciones de compra. Responderlo será completamente opcional y no condicionará la compra, entrega del producto ni acceso al bonus. Las respuestas estarán sujetas al Aviso de Privacidad aplicable.",
      ],
    },
    {
      title: "24. Atención y aclaraciones",
      paragraphs: [
        `Correo: ${business.email}. WhatsApp: ${business.whatsapp}. Horario de atención: ${business.hours}. Tiempo objetivo de respuesta: ${business.responseTime}.`,
      ],
    },
    { title: "25. Domicilio del proveedor", paragraphs: [`${business.address}.`] },
    {
      title: "26. Modificaciones",
      paragraphs: [
        "inttimo podrá actualizar estos términos cuando sea necesario por cambios operativos, legales, logísticos o tecnológicos. Las modificaciones no deberán aplicarse retroactivamente en perjuicio de derechos ya adquiridos por los compradores.",
      ],
    },
    {
      title: "27. Legislación aplicable",
      paragraphs: [
        "Las operaciones realizadas estarán sujetas a la legislación aplicable en los Estados Unidos Mexicanos, incluyendo las disposiciones correspondientes de protección al consumidor.",
      ],
    },
    {
      title: "28. Aceptación",
      paragraphs: [
        "Antes de efectuar el pago, el comprador deberá aceptar expresamente estos Términos y Condiciones y el Aviso de Privacidad mediante la casilla correspondiente.",
      ],
    },
  ],
};
