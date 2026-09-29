import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, sendMail } from "../src/mail.ts";

const mail = { to: "a@b.test", subject: "Hola", text: "Texto", html: "<p>Texto</p>" };

afterEach(() => vi.unstubAllEnvs());

describe("mail", () => {
  it("escapa HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("el driver file guarda el correo", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "mail-")), "outbox.jsonl");
    vi.stubEnv("MAIL_DRIVER", "file");
    vi.stubEnv("MAIL_OUTBOX_FILE", file);
    await sendMail(mail);
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject(mail);
  });

  it("file/log no se permiten en producción", async () => {
    vi.stubEnv("MAIL_DRIVER", "log");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(sendMail(mail)).rejects.toThrow(/no está permitido/);
  });
});
