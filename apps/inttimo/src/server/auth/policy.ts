/*
 * Reglas de acceso al panel (sin dependencias de Next ni de Supabase, para poder probarlas).
 *
 * Desde 2026-11-16 (decisión del usuario, ADR-004) se entra con el correo: un enlace o un código de un solo uso que manda
 * el servidor. La sesión dura 30 días desde que se entró. Una sesión abierta solo con contraseña ya no da acceso.
 * Quien tenga una app autenticadora activada la sigue usando después del correo.
 */

export const ADMIN_SESSION_DAYS = 30;

export type Admin = { id: string; email: string };

export type AdminState =
  | { status: "anonymous" }
  | { status: "forbidden"; email: string }
  | { status: "needs_mfa_verify"; admin: Admin }
  | { status: "ok"; admin: Admin };

export type SessionFacts = {
  id: string;
  email: string;
  role: unknown;
  /** Nivel de la sesión según Supabase: aal2 = se verificó la app autenticadora. */
  aal: string | null | undefined;
  /** Cómo entró y cuándo (segundos Unix). Con hooks personalizados pueden venir solo los nombres. */
  methods: ReadonlyArray<{ method: string; timestamp?: number } | string>;
  hasVerifiedFactor: boolean;
  lastSignInAt: string | null | undefined;
  now: Date;
};

const entries = (methods: SessionFacts["methods"]) => methods.map((m) => (typeof m === "string" ? { method: m, timestamp: undefined } : m));

/** Decide si una sesión de Supabase da acceso al panel. */
export function evaluateAdminSession(facts: SessionFacts): AdminState {
  if (facts.role !== "admin") return { status: "forbidden", email: facts.email };
  const methods = entries(facts.methods);

  // Edad de la sesión: el último inicio registrado en la sesión; si no viene, el último inicio de la cuenta.
  const latest = Math.max(0, ...methods.map((m) => (m.timestamp ?? 0) * 1000));
  const signedInAt = latest || Date.parse(facts.lastSignInAt ?? "") || 0;
  if (facts.now.getTime() - signedInAt > ADMIN_SESSION_DAYS * 86_400_000) return { status: "anonymous" };

  const admin = { id: facts.id, email: facts.email };
  if (facts.aal === "aal2") return { status: "ok", admin };
  if (facts.hasVerifiedFactor) return { status: "needs_mfa_verify", admin };
  // "otp" = entró con el enlace o el código del correo.
  if (methods.some((m) => m.method === "otp")) return { status: "ok", admin };
  return { status: "anonymous" };
}

export type AuthUserLike = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null; banned_until?: string | null };

/** El administrador activo con ese correo, o null. Solo a ellos se les genera un enlace de acceso. */
export function findPanelAdmin<T extends AuthUserLike>(users: readonly T[], email: string, now: Date): T | null {
  const wanted = email.trim().toLowerCase();
  const user = users.find((candidate) => candidate.email?.toLowerCase() === wanted);
  if (!user || user.app_metadata?.role !== "admin") return null;
  if (user.banned_until && Date.parse(user.banned_until) > now.getTime()) return null;
  return user;
}

/** El hash del enlace de Supabase: hexadecimal. Cualquier otra cosa se rechaza sin llamar a Supabase. */
export const isAccessTokenHash = (value: string) => /^[a-f0-9]{20,128}$/i.test(value);
export const isAccessCode = (value: string) => /^\d{6,10}$/.test(value);
