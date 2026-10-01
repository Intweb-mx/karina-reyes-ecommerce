import type { Metadata } from "next";
import { connection } from "next/server";
import { PresaleShell } from "@/components/layout/PresaleShell";
import { StateMessage } from "@/components/presale/sections/StateMessage";
import { business } from "@/content/legal";
import { resolveBonusAccess } from "@/server/presale/bonus";
import { getDb } from "@/server/presale/runtime";

export const metadata: Metadata = { title: "Tu bonus de preventa", robots: { index: false, follow: false } };

const until = (date: Date) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(date);

/** Acceso personal y temporal al bonus digital de preventa (enlace enviado por correo). */
export default async function BonusPage({ params }: PageProps<"/bonus/[token]">) {
  await connection();
  const access = await resolveBonusAccess(getDb(), (await params).token);
  const help = `Si crees que es un error, escríbenos a ${business.email} o por WhatsApp al ${business.whatsapp} con tu número de pedido.`;

  return (
    <PresaleShell>
      <main className="container-page section-y">
        {access.status === "invalid" && <StateMessage as="h1" eyebrow="Bonus de preventa" title="Este enlace no es válido." body={help} />}
        {access.status === "expired" && <StateMessage as="h1" eyebrow={`Bonus · ${access.productName}`} title="Este enlace ya expiró." body={help} />}
        {access.status === "ok" && (
          <div className="mx-auto max-w-2xl">
            <p className="eyebrow text-muted">Bonus exclusivo de preventa · {access.productName}</p>
            <h1 className="mt-4 font-serif text-[clamp(2.5rem,6vw,4rem)] leading-[1.02] font-medium text-balance">{access.bonus.title}</h1>
            <ul className="mt-10 space-y-3">
              {access.bonus.pdfUrl && (
                <li>
                  <a href={access.bonus.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between border border-border bg-surface px-5 py-4 transition-colors hover:border-fg">
                    <span className="font-medium">Guía en PDF</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </li>
              )}
              {access.bonus.videoUrl && (
                <li>
                  <a href={access.bonus.videoUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-between border border-border bg-surface px-5 py-4 transition-colors hover:border-fg">
                    <span className="font-medium">Video especial de Karina</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </li>
              )}
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-muted">
              Enlace personal disponible hasta el {until(access.expiresAt)}. El contenido es para tu uso personal; no está permitida su reproducción ni distribución.
            </p>
          </div>
        )}
      </main>
    </PresaleShell>
  );
}
