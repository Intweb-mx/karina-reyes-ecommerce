import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./client.ts";
import * as schema from "./schema/index.ts";

/** Base PostgreSQL real en memoria con todas las migraciones aplicadas. Solo para pruebas. */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = await PGlite.create();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  return { db: db as unknown as Database, close: () => client.close() };
}
