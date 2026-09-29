import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** Cualquier driver de PostgreSQL (postgres-js en la app, PGlite en pruebas). */
export type Database = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** Conexión independiente del proveedor (Neon, Supabase, RDS, PGlite local…): solo depende de DATABASE_URL. */
export function createDatabase(url = process.env.DATABASE_URL): Database {
  if (!url) {
    throw new Error("DATABASE_URL no está configurada. Revisa .env (ver .env.example).");
  }
  const client = postgres(url, {
    max: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 10),
    // Poolers tipo PgBouncer (modo transaction) no admiten prepared statements.
    prepare: process.env.DATABASE_PREPARE !== "false",
    connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT ?? 10),
    onnotice: () => {},
  });
  return drizzle(client, { schema, casing: "snake_case" }) as unknown as Database;
}
