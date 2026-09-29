import "server-only";
import { logAdminAction, type AuditEntry } from "@inttimo/database";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../presale/runtime";
import { createSupabaseServerClient } from "./supabase";

export type Admin = { id: string; email: string };

export type AdminState =
  | { status: "anonymous" }
  | { status: "forbidden"; email: string }
  | { status: "needs_mfa_enroll"; admin: Admin }
  | { status: "needs_mfa_verify"; admin: Admin }
  | { status: "ok"; admin: Admin };

/**
 * Estado de autenticación consultando al servidor de Supabase Auth (no solo la cookie).
 * El rol vive en `app_metadata`, que solo puede escribir la service role.
 */
export const getAdminState = cache(async (): Promise<AdminState> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: "anonymous" };
  const user = data.user;
  if (user.app_metadata?.role !== "admin") return { status: "forbidden", email: user.email ?? "" };

  const admin = { id: user.id, email: user.email ?? "" };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return { status: "ok", admin };
  const hasVerifiedFactor = (user.factors ?? []).some((factor) => factor.status === "verified");
  return hasVerifiedFactor ? { status: "needs_mfa_verify", admin } : { status: "needs_mfa_enroll", admin };
});

/** Para páginas del panel: redirige a login / 2FA según corresponda. */
export async function requireAdmin(): Promise<Admin> {
  const state = await getAdminState();
  if (state.status === "ok") return state.admin;
  if (state.status === "needs_mfa_enroll" || state.status === "needs_mfa_verify") redirect("/panel/mfa");
  redirect(state.status === "forbidden" ? "/panel/login?error=forbidden" : "/panel/login");
}

/** Registra una acción del panel a nombre del administrador. */
export function audit(admin: Admin, entry: Omit<AuditEntry, "actorId" | "actorEmail">) {
  return logAdminAction(getDb(), { ...entry, actorId: admin.id, actorEmail: admin.email });
}
