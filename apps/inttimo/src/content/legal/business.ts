/*
 * Datos del proveedor y canales de atención. Fuente: documentos legales de inttimo del 30 de septiembre de 2026
 * (Aviso de Privacidad, Términos y Condiciones, Envíos y Cambios y Reembolsos). Son datos reales entregados por el cliente.
 */
export const business = {
  brand: "inttimo",
  legalName: "Karina Reyes Carnero",
  legalNature: "persona física",
  address: "Residencial Torralba, Calle Paseo de las Valdivias 702, Interior 50, Chihuahua, Chihuahua, México",
  email: "inttimojuegosdemesa@gmail.com",
  whatsapp: "639 131 5972",
  whatsappUrl: "https://wa.me/526391315972",
  hours: "9:00 a 17:00 horas",
  responseTime: "hasta 24 horas hábiles",
} as const;

/** Fecha de la versión vigente de los documentos legales (para mostrar; los términos aceptados se versionan en la base). */
export const LEGAL_UPDATED = "30 de septiembre de 2026";
