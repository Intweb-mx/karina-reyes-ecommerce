/*
 * Contenido editorial de la tienda inttimo (Fase 2).
 *
 * Fuentes: Brief maestro (§22, pantallas 01–13), brief de preventa UNO+UNO y documentos legales aprobados
 * (content/legal). ESTADO: PENDIENTE DE APROBACIÓN de Karina. No contiene precios, testimonios, paquetes B2B
 * ni datos de contacto inventados: lo que aún no existe se marca como pendiente.
 */
import type { Faq, TerritoryId } from "@/lib/store/contract";

export const brand = {
  claim: "El matrimonio se cultiva.",
  promise: "Herramientas para matrimonios que quieren conversar con intención, conocerse más y seguir cultivando lo que pasa entre ellos.",
};

/** Territorios del brief maestro: entrada por lo que la pareja quiere cultivar. */
export const territories: { id: TerritoryId; title: string; body: string }[] = [
  { id: "conversacion", title: "Conversación", body: "Hablen más y mejor." },
  { id: "conexion", title: "Conexión", body: "Fortalezcan su vínculo." },
  { id: "intimidad", title: "Intimidad", body: "Descúbranse más." },
  { id: "disfrute", title: "Disfrute", body: "Vivan momentos únicos." },
  { id: "conocimiento", title: "Conocimiento mutuo", body: "Conozcan nuevas facetas." },
  { id: "fe", title: "Fe y propósito", body: "Caminen en la misma dirección." },
];

export const trustPoints = [
  { key: "truck", title: "Envíos a todo México", body: "Con paqueterías a través de SkyDropX." },
  { key: "pin", title: "Recolección en Chihuahua", body: "Sin costo de envío." },
  { key: "lock", title: "Pago seguro", body: "Procesado por Stripe." },
  { key: "chat", title: "Atención directa", body: "Por correo y WhatsApp." },
] as const;

export const nav = [
  { href: "/para-matrimonios", label: "Para matrimonios" },
  { href: "/productos", label: "Productos" },
  { href: "/iglesias", label: "Para iglesias" },
  { href: "/filosofia", label: "Nuestra filosofía" },
] as const;

export const philosophy = {
  title: "Creemos en matrimonios que dejan huella.",
  intro: "En inttimo creemos que un matrimonio intencional puede transformar personas, familias y generaciones.",
  convictions: [
    { title: "Intencionalidad", body: "El amor se cultiva; no se deja al azar." },
    { title: "Conexión real", body: "Las buenas conversaciones cambian todo." },
    { title: "Crecimiento continuo", body: "Siempre hay algo nuevo por descubrir juntos." },
    { title: "Impacto familiar", body: "Un mejor matrimonio transforma generaciones." },
    { title: "Esperanza", body: "Creemos en segundas oportunidades." },
    { title: "Herramientas prácticas", body: "Grandes cambios pueden empezar con pequeñas acciones." },
  ],
  mission: "Crear herramientas que inspiren, acompañen y fortalezcan matrimonios en cada etapa.",
  vision: "Ver matrimonios que transforman el mundo.",
  /** Texto de origen y firma: pendiente de redacción final aprobada por Karina (brief §06). */
  founderPending: true,
};

export const churches = {
  uses: [
    { title: "Grupos de parejas", body: "Para células, clases y grupos continuos." },
    { title: "Retiros matrimoniales", body: "Una herramienta para experiencias significativas." },
    { title: "Consejería", body: "Facilita conversaciones profundas y guiadas." },
    { title: "Iglesias", body: "Fortalece la visión de familia desde la comunidad." },
    { title: "Ministerios", body: "Recurso práctico para programas de acompañamiento." },
    { title: "Eventos especiales", body: "Conferencias, talleres y celebraciones." },
  ],
  /** Paquetes B2B: no se publican precios ni paquetes sin aprobación (CLAUDE.md §24). */
  packagesPending: true,
};

/** Preguntas frecuentes basadas en las políticas aprobadas (Envíos y Recolección, Cambios y Reembolsos, Términos). */
export const faqs: Faq[] = [
  { id: "como-comprar", category: "compra", question: "¿Cómo hago una compra en inttimo?", answer: "Agrega tus productos al carrito, elige cómo recibirlos (envío a domicilio o recolección en Chihuahua) y paga de forma segura. Al terminar recibirás por correo tu número de pedido." },
  { id: "cuenta", category: "compra", question: "¿Necesito crear una cuenta?", answer: "No. Puedes comprar como invitado. Con tu número de pedido y tu correo puedes rastrear tu compra en cualquier momento." },
  { id: "metodos-pago", category: "pagos", question: "¿Qué métodos de pago aceptan?", answer: "Los pagos se procesan de forma segura con Stripe. Verás los métodos disponibles en la página de pago. inttimo no almacena los datos completos de tu tarjeta." },
  { id: "factura", category: "pagos", question: "¿Puedo pedir factura?", answer: "Sí. Solicítala después de realizar tu compra escribiéndonos con tu número de pedido." },
  { id: "envios-mexico", category: "envios", question: "¿Hacen envíos a todo México?", answer: "Sí, los envíos automatizados están disponibles dentro de la República Mexicana. El costo de envío lo cubre el comprador y se muestra antes de pagar." },
  { id: "tiempo-preparacion", category: "envios", question: "¿Cuánto tarda en llegar mi pedido?", answer: "Buscamos preparar los pedidos en un máximo de 24 horas a partir de que el inventario esté disponible. El tiempo de tránsito depende de la paquetería y del destino." },
  { id: "rastreo", category: "envios", question: "¿Cómo puedo rastrear mi pedido?", answer: "Cuando tu pedido salga, te enviaremos la guía de rastreo por correo. También puedes consultarlo en Rastrear pedido con tu número de pedido y tu correo." },
  { id: "recoleccion", category: "envios", question: "¿Puedo recoger mi pedido en Chihuahua?", answer: "Sí, sin costo de envío. Te avisaremos cuando esté LISTO PARA RECOGER con el punto y las instrucciones; espera ese aviso antes de acudir." },
  { id: "internacional", category: "envios", question: "¿Envían fuera de México?", answer: "Los envíos internacionales no forman parte del proceso automatizado. Escríbenos y revisaremos tu caso antes de confirmar cualquier operación." },
  { id: "danado", category: "cambios", question: "Mi producto llegó dañado, ¿qué hago?", answer: "Escríbenos con tu nombre, número de pedido, descripción del problema y fotos. Para agilizar la atención, repórtalo dentro de los 15 días naturales posteriores a recibirlo." },
  { id: "cancelar", category: "cambios", question: "¿Puedo cancelar mi pedido?", answer: "Las solicitudes recibidas antes de que el pedido se prepare o se entregue a paquetería se revisan individualmente. Cuando proceda, se gestiona el reembolso por el medio disponible." },
  { id: "devoluciones", category: "cambios", question: "¿Puedo devolver un producto?", answer: "Las devoluciones se atienden conforme a la Ley Federal de Protección al Consumidor. Escríbenos con tu número de pedido y el motivo para revisar tu caso." },
  { id: "grupos", category: "grupos", question: "¿Tienen opciones para iglesias o grupos?", answer: "Sí. En Para iglesias puedes solicitar una cotización para grupos, retiros, consejería o eventos." },
  { id: "para-quien", category: "producto", question: "¿Los productos son solo para matrimonios?", answer: "Están diseñados para matrimonios y parejas que quieren conversar con intención, en cualquier etapa de su relación." },
];

export const faqCategories: Record<Faq["category"], string> = {
  compra: "Compras",
  pagos: "Pagos y facturas",
  envios: "Envíos y recolección",
  cambios: "Cambios y reembolsos",
  grupos: "Iglesias y grupos",
  producto: "Productos",
};
