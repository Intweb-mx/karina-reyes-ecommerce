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

const MX = "America/Mexico_City";

/** Día calendario (YYYY-MM-DD) → "26 de octubre de 2026". */
export function formatCalendarDate(day: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: MX }).format(new Date(`${day}T12:00:00-06:00`));
}

/** Rango de fechas compacto: "11 – 25 octubre 2026" (mismo mes) o "28 sep – 12 oct 2026". */
export function formatDateRange(startIso: string, endIso: string): string {
  const part = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...options, timeZone: MX }).format(new Date(iso));
  const [sd, sm, sy] = [part(startIso, { day: "numeric" }), part(startIso, { month: "long" }), part(startIso, { year: "numeric" })];
  const [ed, em, ey] = [part(endIso, { day: "numeric" }), part(endIso, { month: "long" }), part(endIso, { year: "numeric" })];
  if (sm === em && sy === ey) return `${sd} – ${ed} ${em} ${ey}`;
  const short = (iso: string) => part(iso, { day: "numeric", month: "short" }).replace(/\./g, "");
  return sy === ey ? `${short(startIso)} – ${short(endIso)} ${ey}` : `${formatShortDate(startIso)} – ${formatShortDate(endIso)}`;
}

/** Días completos entre dos fechas (redondeo hacia arriba), para textos como "durante los 15 días". */
export function daysBetween(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000));
}
