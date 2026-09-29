import { appendFile } from "node:fs/promises";

export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };

/*
 * Envío de correo intercambiable por MAIL_DRIVER:
 * - resend: API HTTP de Resend (producción).
 * - file:   añade el correo a MAIL_OUTBOX_FILE (desarrollo y pruebas).
 * - log:    muestra el correo en la consola del servidor (desarrollo).
 * file/log nunca se aceptan en el deploy de producción.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const driver = process.env.MAIL_DRIVER ?? (process.env.NODE_ENV === "production" ? "resend" : "log");

  if ((driver === "file" || driver === "log") && process.env.VERCEL_ENV === "production") {
    throw new Error(`MAIL_DRIVER=${driver} no está permitido en producción.`);
  }

  if (driver === "log") {
    console.info(`\n[correo] Para: ${mail.to}\nAsunto: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }

  if (driver === "file") {
    const file = process.env.MAIL_OUTBOX_FILE;
    if (!file) throw new Error("MAIL_OUTBOX_FILE no está configurada.");
    await appendFile(file, `${JSON.stringify({ ...mail, sentAt: new Date().toISOString() })}\n`);
    return;
  }

  if (driver === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) throw new Error("Faltan RESEND_API_KEY o MAIL_FROM.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`No se pudo enviar el correo (HTTP ${response.status}).`);
    return;
  }

  throw new Error(`MAIL_DRIVER no soportado: ${driver}`);
}

/** Escapa texto para incluirlo en el HTML de un correo. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
