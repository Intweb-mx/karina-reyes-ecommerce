/**
 * Cuando Postgres cancela una consulta (p. ej. 57014 statement timeout), postgres-js puede rechazar una promesa que nadie
 * espera. El arranque de funciones de Vercel responde a un rechazo sin manejar con `process.exit(128)`, que tumba la
 * instancia entera y deja colgadas las demás peticiones que atendía en ese momento. Aquí el rechazo se registra y la
 * instancia sigue viva; la petición afectada ya falla por su propio camino y responde 503.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason) => {
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : null;
    console.error(JSON.stringify({ level: "error", msg: "unhandled_rejection", code, error: String(reason).slice(0, 300) }));
  });
}
