/** Montos en centavos → "$999.00". Seguro en cliente y servidor. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
}

/** Fecha corta para etiquetas: "31 dic 2030". */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(iso)).replace(/\./g, "");
}
