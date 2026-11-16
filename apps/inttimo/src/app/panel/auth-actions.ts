"use server";

import { hitRateLimit, logAdminAction } from "@inttimo/database";
import { sendMail } from "@inttimo/shared-utils/mail";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { panelAccessMail } from "@/server/auth/access-mail";
import { getAdminState } from "@/server/auth/admin";
import { isAccessCode, isAccessTokenHash } from "@/server/auth/policy";
import { createAccessToken, findAdminByEmail } from "@/server/auth/service";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getDb } from "@/server/presale/runtime";

export type FormState = { error?: string; email?: string; sent?: boolean } | undefined;

/** Vigencia del enlace y el código (Supabase: "Email OTP expiration", 3600 s por defecto). */
const ACCESS_MINUTES = 60;
const CONNECTION_ERROR = "No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.";
const NO_ACCESS = "Esta cuenta no tiene acceso al panel.";

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hash(ip);
}

const log = (msg: string, error: unknown) =>
  console.error(JSON.stringify({ level: "error", msg, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }));

/**
 * Paso 1: manda al correo un enlace y un código para entrar. Responde lo mismo exista o no la cuenta, para no revelar
 * qué correos son de administradores; solo a un administrador activo se le genera y manda algo.
 */
export async function requestAccess(_state: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!z.email().safeParse(email).success) return { error: "Escribe un correo válido.", email };

  const db = getDb();
  if (await hitRateLimit(db, `panel:access:ip:${await clientKey()}`, 10, 900)) return { error: "Demasiados intentos. Espera 15 minutos.", email };
  if (await hitRateLimit(db, `panel:access:email:${hash(email)}`, 5, 3600)) {
    return { error: "Ya pediste varios correos. Usa el más reciente o espera una hora.", email };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const admin = await findAdminByEmail(email);
    if (admin) {
      if (!siteUrl) throw new Error("Falta NEXT_PUBLIC_SITE_URL.");
      const { tokenHash, code } = await createAccessToken(email);
      // El token va en el fragmento (#): el navegador no lo manda al servidor, así no queda en registros ni lo gasta
      // un antivirus de correo que abra el enlace antes que la persona.
      const link = `${siteUrl.replace(/\/$/, "")}/panel/entrar#${tokenHash}`;
      await sendMail(panelAccessMail({ to: email, link, code, minutes: ACCESS_MINUTES }));
      await logAdminAction(db, { actorId: admin.id, actorEmail: email, action: "auth.access_requested", targetType: "admin", targetId: admin.id });
    }
  } catch (error) {
    log("panel_access_request_failed", error);
    return { error: "No pudimos mandar el correo. Inténtalo de nuevo en unos minutos.", email };
  }
  return { sent: true, email };
}

/** Termina el acceso: confirma que la cuenta es de administrador y entra al panel (o pide la app autenticadora). */
async function finishSignIn(method: "email_link" | "email_code"): Promise<FormState> {
  const state = await getAdminState();
  if (state.status === "anonymous" || state.status === "forbidden") {
    await (await createSupabaseServerClient()).auth.signOut();
    return { error: NO_ACCESS };
  }
  if (state.status === "needs_mfa_verify") redirect("/panel/mfa");
  await logAdminAction(getDb(), { actorId: state.admin.id, actorEmail: state.admin.email, action: "auth.login", targetType: "admin", targetId: state.admin.id, metadata: { method } });
  redirect("/panel");
}

/** Paso 2a: el código de 6 dígitos del correo (cuando el correo se abrió en otro dispositivo). */
export async function verifyAccessCode(_state: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!z.email().safeParse(email).success) return { error: "Vuelve a escribir tu correo.", email };
  if (!isAccessCode(code)) return { error: "Escribe el código de 6 dígitos del correo.", email, sent: true };

  const db = getDb();
  if (
    (await hitRateLimit(db, `panel:code:ip:${await clientKey()}`, 20, 900)) ||
    (await hitRateLimit(db, `panel:code:email:${hash(email)}`, 10, 900))
  ) {
    return { error: "Demasiados intentos. Espera 15 minutos.", email, sent: true };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    if (error.name === "AuthRetryableFetchError") return { error: CONNECTION_ERROR, email, sent: true };
    return { error: "Código incorrecto o vencido. Revisa el correo más reciente o pide otro.", email, sent: true };
  }
  return { ...(await finishSignIn("email_code")), email };
}

/** Paso 2b: el botón del correo. `tokenHash` llega del fragmento del enlace. */
export async function signInWithLink(tokenHash: string): Promise<FormState> {
  if (!isAccessTokenHash(tokenHash)) return { error: "El enlace está incompleto. Ábrelo desde el correo o pide otro." };
  if (await hitRateLimit(getDb(), `panel:link:ip:${await clientKey()}`, 20, 900)) return { error: "Demasiados intentos. Espera 15 minutos." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) {
    if (error.name === "AuthRetryableFetchError") return { error: CONNECTION_ERROR };
    return { error: "Este enlace ya se usó o venció. Pide uno nuevo." };
  }
  return finishSignIn("email_link");
}

/** Cuentas que activaron una app autenticadora: la piden después del correo. */
export async function verifyMfa(_state: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Escribe el código de 6 dígitos." };

  const state = await getAdminState();
  if (state.status !== "needs_mfa_verify") redirect("/panel");
  if (await hitRateLimit(getDb(), `panel:mfa:${state.admin.id}`, 10, 900)) return { error: "Demasiados intentos. Espera 15 minutos." };

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { error: "Vuelve a cargar la página e inténtalo de nuevo." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "Código incorrecto o vencido." };

  await logAdminAction(getDb(), { actorId: state.admin.id, actorEmail: state.admin.email, action: "auth.login", targetType: "admin", targetId: state.admin.id, metadata: { method: "totp" } });
  redirect("/panel");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/panel/login");
}
