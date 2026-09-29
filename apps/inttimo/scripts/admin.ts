/**
 * Administradores del panel (no existe registro público).
 *
 *   pnpm admin --create --email=persona@dominio.com       # pide contraseña (o ADMIN_PASSWORD)
 *   pnpm admin --reset-password --email=...               # nueva contraseña
 *   pnpm admin --reset-mfa --email=...                    # borra su 2FA: la vuelve a configurar al entrar
 *   pnpm admin --revoke --email=...                       # quita acceso y bloquea la cuenta
 *   pnpm admin --list
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (llave secreta / service role).
 */
import { createDatabase, logAdminAction } from "@inttimo/database";
import { createClient, type User } from "@supabase/supabase-js";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
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

async function askPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!stdin.isTTY) fail("Define ADMIN_PASSWORD o ejecuta en una terminal interactiva.");
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  // Oculta lo que se escribe.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
    if (s.includes("Contraseña")) stdout.write(s);
  };
  const password = await new Promise<string>((resolve) => rl.question("Contraseña (mín. 12, mayúsculas, minúsculas y números): ", resolve));
  rl.close();
  stdout.write("\n");
  return password;
}

function validPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
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
    const mfa = (user.factors ?? []).some((f) => f.status === "verified") ? "2FA" : "sin 2FA";
    console.log(`${user.email}\t${role}\t${mfa}\t${user.banned_until ? "bloqueado" : "activo"}`);
  }
  process.exit(0);
}

const email = arg("email")?.trim().toLowerCase() ?? fail("Falta --email=...");
const existing = await findUser(email);

if (flag("create")) {
  if (existing) fail("Ya existe. Usa --reset-password o --reset-mfa.");
  const password = await askPassword();
  if (!validPassword(password)) fail("Contraseña débil: mínimo 12 caracteres con mayúsculas, minúsculas y números.");
  const { data, error } = await auth.createUser({ email, password, email_confirm: true, app_metadata: { role: "admin" } });
  if (error || !data.user) fail(`No se pudo crear: ${error?.message}`);
  await log("admin.create", data.user);
  console.log(`Administrador creado: ${email}. Al entrar a /panel configurará la verificación en dos pasos.`);
} else if (!existing) {
  fail(`No existe ${email}.`);
} else if (flag("reset-password")) {
  const password = await askPassword();
  if (!validPassword(password)) fail("Contraseña débil: mínimo 12 caracteres con mayúsculas, minúsculas y números.");
  const { error } = await auth.updateUserById(existing.id, { password });
  if (error) fail(error.message);
  await log("admin.reset_password", existing);
  console.log("Contraseña actualizada.");
} else if (flag("reset-mfa")) {
  const { data, error } = await auth.mfa.listFactors({ userId: existing.id });
  if (error) fail(error.message);
  for (const factor of data.factors) await auth.mfa.deleteFactor({ userId: existing.id, id: factor.id });
  await log("admin.reset_mfa", existing);
  console.log(`2FA eliminado (${data.factors.length} factores). Deberá configurarlo de nuevo al entrar.`);
} else if (flag("revoke")) {
  const { error } = await auth.updateUserById(existing.id, { app_metadata: { role: null }, ban_duration: "876000h" });
  if (error) fail(error.message);
  await log("admin.revoke", existing);
  console.log("Acceso revocado y cuenta bloqueada.");
} else {
  fail("Indica --create, --reset-password, --reset-mfa, --revoke o --list.");
}
process.exit(0);
