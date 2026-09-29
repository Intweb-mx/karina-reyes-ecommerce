/**
 * Se ejecuta en el build de Vercel: aplica migraciones pendientes solo en el
 * deploy de producción (los previews no deben modificar la base de producción).
 */
import { execFileSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Migraciones: se omiten fuera del deploy de producción.");
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Migraciones: DATABASE_URL no está configurada; la preventa no puede operar sin base de datos.");
  process.exit(1);
}

execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", new URL("./migrate.ts", import.meta.url).pathname], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
