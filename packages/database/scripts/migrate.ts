import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no está configurada.");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: process.env.DATABASE_PREPARE !== "false", onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await client.end();
console.log("Migraciones aplicadas.");
