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
