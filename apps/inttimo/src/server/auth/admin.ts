import "server-only";
import { logAdminAction, type AuditEntry } from "@inttimo/database";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../presale/runtime";
import { evaluateAdminSession, type Admin, type AdminState } from "./policy";
import { createSupabaseServerClient } from "./supabase";

export type { Admin, AdminState } from "./policy";

/**
 * Estado de autenticación consultando al servidor de Supabase Auth (no solo la cookie).
 * El rol vive en `app_metadata`, que solo puede escribir la service role. Las reglas están en `policy.ts`.
 */
export const getAdminState = cache(async (): Promise<AdminState> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: "anonymous" };
  const user = data.user;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return evaluateAdminSession({
    id: user.id,
    email: user.email ?? "",
    role: user.app_metadata?.role,
    aal: aal?.currentLevel,
    methods: aal?.currentAuthenticationMethods ?? [],
    hasVerifiedFactor: (user.factors ?? []).some((factor) => factor.status === "verified"),
    lastSignInAt: user.last_sign_in_at,
    now: new Date(),
  });
});

/** Para páginas del panel: redirige al acceso / a la app autenticadora según corresponda. */
export async function requireAdmin(): Promise<Admin> {
  const state = await getAdminState();
  if (state.status === "ok") return state.admin;
  if (state.status === "needs_mfa_verify") redirect("/panel/mfa");
  redirect(state.status === "forbidden" ? "/panel/login?error=forbidden" : "/panel/login");
}

/** Registra una acción del panel a nombre del administrador. */
export function audit(admin: Admin, entry: Omit<AuditEntry, "actorId" | "actorEmail">) {
  return logAdminAction(getDb(), { ...entry, actorId: admin.id, actorEmail: admin.email });
}
