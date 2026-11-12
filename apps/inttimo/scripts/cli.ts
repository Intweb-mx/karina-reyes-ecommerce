/** Utilidades compartidas por los scripts de operación (se ejecutan con Node, fuera de Next). */
export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * DATABASE_URL validada para scripts que escriben en la tienda: nunca el puerto 54322 (otro proyecto) y, si no es local,
 * solo con --allow-remote (producción).
 */
export function storeDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? fail("Falta DATABASE_URL.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL no es una URL válida.");
  }
  if (parsed.port === "54322") fail("DATABASE_URL apunta al puerto 54322 (la base de otro proyecto): no se usa.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && !flag("allow-remote")) {
    fail(`DATABASE_URL apunta a ${parsed.hostname}, no a una base local. Si de verdad es la base real, repite con --allow-remote.`);
  }
  console.log(`Base: ${parsed.hostname}`);
  return url;
}
