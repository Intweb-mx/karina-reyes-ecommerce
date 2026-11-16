import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { authFetch } from "./fetch";
import { findPanelAdmin } from "./policy";

/**
 * Cliente de Supabase con la llave secreta. Solo en el servidor y solo para el acceso por correo: buscar al administrador
 * y generar su enlace de un solo uso sin que Supabase mande el correo (lo manda la app con su proveedor).
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: authFetch } });
}

/** El administrador activo con ese correo, o null. */
export async function findAdminByEmail(email: string, now = new Date()): Promise<User | null> {
  const auth = serviceClient().auth.admin;
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const admin = findPanelAdmin(data.users, email, now);
    if (admin || data.users.length < 200) return admin;
  }
}

/**
 * Enlace y código de un solo uso para un administrador que ya existe. Ojo: Supabase crea la cuenta si el correo no existe,
 * por eso solo se llama después de `findAdminByEmail`. Cada enlace nuevo invalida el anterior.
 */
export async function createAccessToken(email: string): Promise<{ tokenHash: string; code: string }> {
  const { data, error } = await serviceClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties) throw error ?? new Error("Supabase no devolvió el enlace.");
  return { tokenHash: data.properties.hashed_token, code: data.properties.email_otp };
}
