import { escapeHtml, type Mail } from "@inttimo/shared-utils/mail";

/** Correo con el enlace y el código para entrar al panel. Texto interno (lo lee el equipo, no clientes). */
export function panelAccessMail(input: { to: string; link: string; code: string; minutes: number }): Mail {
  const lines = [
    "Hola:",
    "",
    "Para entrar al panel de inttimo, abre este enlace:",
    input.link,
    "",
    `Si abriste este correo en otro dispositivo, escribe este código en la pantalla de acceso: ${input.code}`,
    "",
    `El enlace y el código sirven una sola vez y vencen en ${input.minutes} minutos. Después quedas dentro del panel en ese navegador por 30 días.`,
    "",
    "Si no pediste entrar, ignora este correo: nadie puede entrar sin él.",
    "",
    "— inttimo —",
  ];
  const p = (text: string) => `<p>${escapeHtml(text)}</p>`;
  const html = [
    p("Hola:"),
    p("Para entrar al panel de inttimo, presiona el botón:"),
    `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:12px 24px;background:#221c17;color:#ffffff;text-decoration:none">Entrar al panel</a></p>`,
    p("Si abriste este correo en otro dispositivo, escribe este código en la pantalla de acceso:"),
    `<p style="font-size:28px;letter-spacing:6px;font-family:monospace"><strong>${escapeHtml(input.code)}</strong></p>`,
    p(`El botón y el código sirven una sola vez y vencen en ${input.minutes} minutos. Después quedas dentro del panel en ese navegador por 30 días.`),
    p("Si no pediste entrar, ignora este correo: nadie puede entrar sin él."),
    p("— inttimo —"),
  ].join("");
  return { to: input.to, subject: "Tu acceso al panel de inttimo", text: lines.join("\n"), html };
}
