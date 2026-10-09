"use server";

import { hitRateLimit, logAdminAction } from "@inttimo/database";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminState } from "@/server/auth/admin";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getDb } from "@/server/presale/runtime";

export type FormState = { error?: string; email?: string } | undefined;

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(200) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  // Se devuelve el correo para que el formulario no lo borre tras un intento fallido.
  const email = String(form.get("email") ?? "").slice(0, 254);
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, email };

  if (await hitRateLimit(getDb(), `panel:login:${await clientKey()}`, 10, 900)) {
    return { error: "Demasiados intentos. Espera 15 minutos.", email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Un corte de red o un tiempo agotado no es una contraseña incorrecta.
    if (error.name === "AuthRetryableFetchError") return { error: "No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.", email };
    return { error: GENERIC_LOGIN_ERROR, email };
  }

  const state = await getAdminState();
  if (state.status === "anonymous" || state.status === "forbidden") {
    await supabase.auth.signOut();
    return { error: GENERIC_LOGIN_ERROR, email };
  }
  redirect(state.status === "ok" ? "/panel" : "/panel/mfa");
}

/** Alta del autenticador: el factor queda pendiente hasta verificar el primer código. */
export async function startMfaEnrollment(): Promise<{ factorId: string; qrCode: string; secret: string } | { error: string }> {
  const state = await getAdminState();
  if (state.status !== "needs_mfa_enroll") return { error: "No disponible." };
  const supabase = await createSupabaseServerClient();
  // Factores sin verificar de intentos anteriores bloquean un alta nueva.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `inttimo-${Date.now()}` });
  if (error || !data) return { error: "No se pudo iniciar la configuración. Recarga la página." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfa(_state: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Escribe el código de 6 dígitos." };

  const state = await getAdminState();
  if (state.status !== "needs_mfa_enroll" && state.status !== "needs_mfa_verify") redirect("/panel");
  if (await hitRateLimit(getDb(), `panel:mfa:${state.admin.id}`, 10, 900)) return { error: "Demasiados intentos. Espera 15 minutos." };

  const supabase = await createSupabaseServerClient();
  const requested = String(form.get("factorId") ?? "");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor =
    state.status === "needs_mfa_enroll"
      ? factors?.all.find((f) => f.id === requested && f.status === "unverified")
      : factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { error: "Vuelve a cargar la página e inténtalo de nuevo." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "Código incorrecto o vencido." };

  await logAdminAction(getDb(), {
    actorId: state.admin.id,
    actorEmail: state.admin.email,
    action: state.status === "needs_mfa_enroll" ? "auth.mfa_enrolled" : "auth.login",
    targetType: "admin",
    targetId: state.admin.id,
  });
  redirect("/panel");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/panel/login");
}
