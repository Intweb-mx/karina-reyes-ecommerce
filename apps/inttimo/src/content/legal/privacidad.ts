import { business, LEGAL_UPDATED } from "./business.ts";
import type { LegalDocument } from "./types.ts";

/** Fuente: AVISO_INTTIMO.pdf (30 de septiembre de 2026). Texto aprobado por el cliente; no editar sin su autorización. */
export const privacidad: LegalDocument = {
  slug: "aviso-de-privacidad",
  shortTitle: "Aviso de Privacidad",
  title: ["Aviso de Privacidad Integral", "inttimo"],
  updated: `Última actualización: ${LEGAL_UPDATED}`,
  intro: [
    "El presente Aviso de Privacidad Integral se emite de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente y tiene por objeto informar a las personas titulares sobre el tratamiento de sus datos personales por parte de inttimo.",
  ],
  sections: [
    {
      title: "1. Responsable del tratamiento de los datos personales",
      paragraphs: [
        `${business.legalName}, ${business.legalNature}, titular de la marca inttimo, es responsable del tratamiento de los datos personales recabados a través del sitio web, formularios, procesos de compra, preventa, atención al cliente y demás canales relacionados con inttimo. Domicilio: ${business.address}. Correo de contacto: ${business.email}. WhatsApp: ${business.whatsapp}.`,
      ],
    },
    {
      title: "2. Datos personales que podemos recabar",
      paragraphs: [
        "Para realizar una compra, gestionar un pedido o brindar atención, inttimo podrá recabar datos de identificación y contacto, como nombre completo, correo electrónico y teléfono o WhatsApp; datos de entrega, como nombre de quien recibe, domicilio, calle, número, colonia, código postal, ciudad, estado y referencias; datos relacionados con la compra, como productos, cantidades, número de pedido, importe, método de entrega, estado del pedido y datos de rastreo; y datos fiscales cuando el titular solicite factura. Los datos completos de tarjetas bancarias son procesados por Stripe y no son almacenados directamente por inttimo.",
      ],
    },
    {
      title: "3. Cuestionarios opcionales y datos sensibles",
      paragraphs: [
        "Después de una compra, inttimo podrá invitar al titular a responder cuestionarios voluntarios para conocer mejor a sus clientes y mejorar productos, contenidos y experiencias. Algunas respuestas podrían revelar información relacionada con aspectos íntimos, convicciones religiosas u otros datos que, dependiendo de su contenido, puedan considerarse sensibles. La participación será opcional y no condicionará la compra, entrega, atención, garantía ni acceso a beneficios adquiridos. Cuando corresponda, se solicitará consentimiento expreso antes de tratar datos personales sensibles.",
      ],
    },
    {
      title: "4. Finalidades primarias",
      paragraphs: [
        "Los datos personales serán utilizados para: identificar al comprador; procesar y confirmar compras y preventas; registrar y administrar pedidos; procesar pagos a través de proveedores autorizados; gestionar inventario; cotizar, generar y dar seguimiento a envíos; coordinar recolecciones; comunicarse sobre el estado del pedido; atender dudas, aclaraciones, incidencias, cambios, reposiciones o reembolsos; entregar beneficios digitales asociados a la compra, incluyendo bonus de preventa; atender solicitudes de facturación; prevenir duplicidades, errores o usos indebidos del sistema; y cumplir obligaciones legales, fiscales, contractuales y de protección al consumidor que resulten aplicables.",
      ],
    },
    {
      title: "5. Finalidades secundarias",
      paragraphs: [
        "Con autorización del titular, inttimo podrá utilizar determinados datos para realizar encuestas, análisis estadísticos y de preferencias, conocer mejor a su comunidad, mejorar productos y experiencias, desarrollar nuevos recursos, y enviar comunicaciones sobre contenidos, lanzamientos, productos, eventos o promociones. El titular puede negarse a estas finalidades sin que ello afecte su compra o relación comercial.",
      ],
    },
    {
      title: "6. Cómo limitar finalidades secundarias",
      paragraphs: [
        `El titular podrá solicitar en cualquier momento que sus datos no sean utilizados para finalidades secundarias o promocionales enviando un correo a ${business.email} con el asunto “Limitar uso de datos”, indicando su nombre y la solicitud correspondiente. Las comunicaciones estrictamente necesarias para administrar una compra, entrega, pago, incidencia o relación contractual podrán continuar mientras sean necesarias.`,
      ],
    },
    {
      title: "7. Transferencias y encargados",
      paragraphs: [
        "Para cumplir las finalidades descritas, inttimo podrá compartir o permitir el tratamiento de datos estrictamente necesarios con proveedores que actúen por cuenta de inttimo o que sean necesarios para completar la operación, tales como plataformas de pago, servicios tecnológicos, alojamiento web, correo electrónico, logística, mensajería y rastreo. Entre ellos pueden encontrarse Stripe para procesamiento de pagos y SkyDropX y/o empresas transportistas para cotización, generación y seguimiento de envíos. Asimismo, podrán realizarse transferencias cuando sean necesarias para cumplir obligaciones legales o requerimientos de autoridad competente. inttimo procurará que el tratamiento por terceros se limite a las finalidades correspondientes y se realice conforme a la normativa aplicable.",
      ],
    },
    {
      title: "8. Derechos ARCO",
      paragraphs: [
        `El titular puede ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO) respecto de sus datos personales. Para ello deberá enviar una solicitud a ${business.email} con el asunto “Derechos ARCO”, indicando: nombre del titular; medio para comunicar la respuesta; descripción clara del derecho que desea ejercer y de los datos involucrados; y, cuando resulte necesario, documentación que permita acreditar identidad o representación. inttimo atenderá la solicitud dentro de los plazos establecidos por la legislación aplicable y podrá requerir información adicional cuando sea necesaria para identificar al titular o localizar los datos.`,
      ],
    },
    {
      title: "9. Revocación del consentimiento",
      paragraphs: [
        `Cuando el tratamiento dependa del consentimiento del titular, éste podrá solicitar su revocación enviando un correo a ${business.email}. La revocación no tendrá efectos retroactivos y podrá estar sujeta a las excepciones y obligaciones de conservación previstas en la legislación aplicable.`,
      ],
    },
    {
      title: "10. Conservación y seguridad",
      paragraphs: [
        "inttimo conservará los datos personales durante el tiempo necesario para cumplir las finalidades informadas, atender obligaciones derivadas de la relación comercial y observar los plazos legales aplicables. Se adoptarán medidas administrativas, técnicas y físicas razonables para proteger los datos contra daño, pérdida, alteración, destrucción, acceso, uso o tratamiento no autorizado.",
      ],
    },
    {
      title: "11. Cookies y tecnologías similares",
      paragraphs: [
        "El sitio de inttimo podrá utilizar cookies y tecnologías similares necesarias para el funcionamiento del sitio, seguridad, sesión, carrito, medición y mejora de la experiencia. Cuando se utilicen tecnologías no indispensables o con finalidades adicionales, se informará al usuario y, cuando corresponda, se solicitará su consentimiento.",
      ],
    },
    {
      title: "12. Menores de edad",
      paragraphs: [
        "Los productos y procesos de compra de inttimo están dirigidos a personas con capacidad legal para realizar compras. inttimo no busca recabar deliberadamente datos personales de menores de edad a través del proceso de compra. Si se detecta que se han proporcionado datos de un menor sin la autorización correspondiente, podrá solicitarse su eliminación conforme a la legislación aplicable.",
      ],
    },
    {
      title: "13. Cambios al Aviso de Privacidad",
      paragraphs: [
        "inttimo podrá modificar o actualizar este Aviso de Privacidad por cambios legales, operativos, tecnológicos o relacionados con sus servicios. La versión vigente estará disponible en el sitio web de inttimo. Cuando los cambios sean sustanciales y resulte necesario, se comunicarán mediante el sitio, correo electrónico u otro medio de contacto disponible.",
      ],
    },
    {
      title: "14. Contacto",
      paragraphs: [
        `Para dudas sobre privacidad, tratamiento de datos personales, limitación de uso, revocación del consentimiento o ejercicio de derechos ARCO, el titular puede contactar a inttimo en: ${business.email}, WhatsApp ${business.whatsapp}, o en ${business.address}.`,
      ],
    },
  ],
  appendix: {
    title: "Aviso de Privacidad Simplificado para formularios y checkout",
    paragraphs: [
      `${business.legalName}, titular de inttimo, con domicilio en ${business.address}, es responsable del tratamiento de tus datos personales. Utilizaremos tus datos principalmente para procesar compras, pagos, pedidos, entregas, atención y beneficios asociados. Las finalidades secundarias, como encuestas o comunicaciones promocionales, son opcionales. Puedes conocer el Aviso de Privacidad Integral y ejercer tus derechos ARCO mediante ${business.email}.`,
    ],
  },
};
