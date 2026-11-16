import { describe, expect, it } from "vitest";
import { panelAccessMail } from "../src/server/auth/access-mail.ts";
import { evaluateAdminSession, findPanelAdmin, isAccessCode, isAccessTokenHash, type SessionFacts } from "../src/server/auth/policy.ts";

const now = new Date("2026-11-16T12:00:00Z");
const secs = (date: Date) => Math.floor(date.getTime() / 1000);
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const facts = (over: Partial<SessionFacts> = {}): SessionFacts => ({
  id: "u1",
  email: "karina@example.com",
  role: "admin",
  aal: "aal1",
  methods: [{ method: "otp", timestamp: secs(daysAgo(1)) }],
  hasVerifiedFactor: false,
  lastSignInAt: daysAgo(1).toISOString(),
  now,
  ...over,
});

describe("evaluateAdminSession", () => {
  it("lets an admin in after the email link or code", () => {
    expect(evaluateAdminSession(facts())).toEqual({ status: "ok", admin: { id: "u1", email: "karina@example.com" } });
  });

  it("rejects accounts without the admin role", () => {
    expect(evaluateAdminSession(facts({ role: undefined }))).toEqual({ status: "forbidden", email: "karina@example.com" });
  });

  it("does not accept a password-only session", () => {
    expect(evaluateAdminSession(facts({ methods: [{ method: "password", timestamp: secs(daysAgo(1)) }] }))).toEqual({ status: "anonymous" });
  });

  it("asks for the authenticator app when the account has one", () => {
    expect(evaluateAdminSession(facts({ hasVerifiedFactor: true })).status).toBe("needs_mfa_verify");
    expect(evaluateAdminSession(facts({ hasVerifiedFactor: true, aal: "aal2" })).status).toBe("ok");
  });

  it("keeps the session for 30 days after signing in, then asks again", () => {
    expect(evaluateAdminSession(facts({ methods: [{ method: "otp", timestamp: secs(daysAgo(29.9)) }] })).status).toBe("ok");
    expect(evaluateAdminSession(facts({ methods: [{ method: "otp", timestamp: secs(daysAgo(30.1)) }] })).status).toBe("anonymous");
    expect(evaluateAdminSession(facts({ aal: "aal2", methods: [{ method: "totp", timestamp: secs(daysAgo(31)) }] })).status).toBe("anonymous");
  });

  it("uses the latest sign-in of the session", () => {
    const methods = [
      { method: "password", timestamp: secs(daysAgo(60)) },
      { method: "otp", timestamp: secs(daysAgo(2)) },
    ];
    expect(evaluateAdminSession(facts({ methods })).status).toBe("ok");
  });

  it("falls back to the account's last sign-in when the session has no timestamps", () => {
    expect(evaluateAdminSession(facts({ methods: ["otp"], lastSignInAt: daysAgo(3).toISOString() })).status).toBe("ok");
    expect(evaluateAdminSession(facts({ methods: ["otp"], lastSignInAt: daysAgo(40).toISOString() })).status).toBe("anonymous");
    expect(evaluateAdminSession(facts({ methods: ["otp"], lastSignInAt: null })).status).toBe("anonymous");
  });
});

describe("findPanelAdmin", () => {
  const users = [
    { id: "a", email: "Karina@Example.com", app_metadata: { role: "admin" } },
    { id: "b", email: "cliente@example.com", app_metadata: {} },
    { id: "c", email: "revocada@example.com", app_metadata: { role: "admin" }, banned_until: "2126-01-01T00:00:00Z" },
    { id: "d", email: "vencida@example.com", app_metadata: { role: "admin" }, banned_until: "2026-01-01T00:00:00Z" },
  ];

  it("finds an active admin regardless of case and spaces", () => {
    expect(findPanelAdmin(users, "  karina@example.COM ", now)?.id).toBe("a");
  });

  it("ignores unknown emails, non-admins and blocked accounts", () => {
    expect(findPanelAdmin(users, "nadie@example.com", now)).toBeNull();
    expect(findPanelAdmin(users, "cliente@example.com", now)).toBeNull();
    expect(findPanelAdmin(users, "revocada@example.com", now)).toBeNull();
    expect(findPanelAdmin(users, "vencida@example.com", now)?.id).toBe("d");
  });
});

describe("access token format", () => {
  it("accepts Supabase hashes and numeric codes only", () => {
    expect(isAccessTokenHash("a".repeat(56))).toBe(true);
    expect(isAccessTokenHash("abc")).toBe(false);
    expect(isAccessTokenHash("../../x".padEnd(40, "a"))).toBe(false);
    expect(isAccessCode("123456")).toBe(true);
    expect(isAccessCode("12345")).toBe(false);
    expect(isAccessCode("12345a")).toBe(false);
  });
});

describe("panelAccessMail", () => {
  it("carries the button link and the code, escaped in HTML", () => {
    const mail = panelAccessMail({ to: "karina@example.com", link: "https://www.inttimo.shop/panel/entrar#abc123", code: "123456", minutes: 60 });
    expect(mail.to).toBe("karina@example.com");
    expect(mail.subject).not.toContain("123456");
    expect(mail.text).toContain("https://www.inttimo.shop/panel/entrar#abc123");
    expect(mail.text).toContain("123456");
    expect(mail.text).toContain("60 minutos");
    expect(mail.html).toContain('href="https://www.inttimo.shop/panel/entrar#abc123"');
    expect(mail.html).toContain("Entrar al panel");
  });
});
