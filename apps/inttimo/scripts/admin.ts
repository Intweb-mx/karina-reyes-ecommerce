/**
 * Administradores del panel (no existe registro público).
 *
 * Se entra al panel con el correo (enlace o código de un solo uso, ADR-004): no hay contraseñas.
 *
 *   pnpm admin --create --email=persona@dominio.com       # da acceso; entra en /panel/login con ese correo
 *   pnpm admin --grant --email=...                        # devuelve el acceso a una cuenta revocada
 *   pnpm admin --reset-mfa --email=...                    # quita su app autenticadora (si la tenía)
 *   pnpm admin --revoke --email=...                       # quita acceso y bloquea la cuenta
 *   pnpm admin --list
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (llave secreta / service role).
 */
import { createDatabase, logAdminAction } from "@inttimo/database";
import { createClient, type User } from "@supabase/supabase-js";
import { arg, fail, flag } from "./cli.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fail("Falta NEXT_PUBLIC_SUPABASE_URL.");
const secret = process.env.SUPABASE_SECRET_KEY ?? fail("Falta SUPABASE_SECRET_KEY.");
const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = supabase.auth.admin;

async function findUser(email: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 200 });
    if (error) fail(`Supabase: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user || data.users.length < 200) return user ?? null;
  }
}


async function log(action: string, user: User) {
  const db = createDatabase();
  await logAdminAction(db, { actorId: null, actorEmail: "cli", action, targetType: "admin", targetId: user.id, metadata: { email: user.email } });
}

if (flag("list")) {
  const { data, error } = await auth.listUsers({ page: 1, perPage: 200 });
  if (error) fail(error.message);
  for (const user of data.users) {
    const role = user.app_metadata?.role ?? "—";
    // listUsers no trae los factores: hay que pedirlos por usuario.
    const { data: factors } = await auth.mfa.listFactors({ userId: user.id });
    const mfa = (factors?.factors ?? []).some((f) => f.status === "verified") ? "app autenticadora" : "solo correo";
    console.log(`${user.email}\t${role}\t${mfa}\t${user.banned_until ? "bloqueado" : "activo"}`);
  }
  process.exit(0);
}

const email = arg("email")?.trim().toLowerCase() ?? fail("Falta --email=...");
const existing = await findUser(email);

if (flag("create")) {
  if (existing) fail("Ya existe. Usa --grant si se le quitó el acceso, o --reset-mfa.");
  const { data, error } = await auth.createUser({ email, email_confirm: true, app_metadata: { role: "admin" } });
  if (error || !data.user) fail(`No se pudo crear: ${error?.message}`);
  await log("admin.create", data.user);
  console.log(`Administrador creado: ${email}. Entra en /panel/login con su correo: le llega un botón para entrar.`);
} else if (!existing) {
  fail(`No existe ${email}.`);
} else if (flag("grant")) {
  const { error } = await auth.updateUserById(existing.id, { app_metadata: { role: "admin" }, ban_duration: "none" });
  if (error) fail(error.message);
  await log("admin.grant", existing);
  console.log(`Acceso al panel activado para ${email}. Entra en /panel/login con su correo.`);
} else if (flag("reset-mfa")) {
  const { data, error } = await auth.mfa.listFactors({ userId: existing.id });
  if (error) fail(error.message);
  for (const factor of data.factors) await auth.mfa.deleteFactor({ userId: existing.id, id: factor.id });
  await log("admin.reset_mfa", existing);
  console.log(`App autenticadora eliminada (${data.factors.length} factores). Ahora entra solo con su correo.`);
} else if (flag("revoke")) {
  const { error } = await auth.updateUserById(existing.id, { app_metadata: { role: null }, ban_duration: "876000h" });
  if (error) fail(error.message);
  await log("admin.revoke", existing);
  console.log("Acceso revocado y cuenta bloqueada.");
} else {
  fail("Indica --create, --grant, --reset-mfa, --revoke o --list.");
}
process.exit(0);
