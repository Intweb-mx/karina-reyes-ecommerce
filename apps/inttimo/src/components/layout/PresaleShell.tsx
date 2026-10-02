import type { ReactNode } from "react";
import Link from "next/link";
import { ChatIcon, LockIcon, MailIcon } from "@/components/ui/icons";
import { business, legalDocuments } from "@/content/legal";
import { Wordmark } from "./Wordmark";

/**
 * Marco de las páginas de preventa y legales. La navegación completa de la tienda (CLAUDE.md §9) llega con la Fase 2;
 * aquí no se enlaza a rutas que aún no existen. El bloque "Legal" del pie es obligatorio y permanente.
 */
export function PresaleShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75 print:static print:border-0">
        <div className="container-page flex h-(--header-height) items-center justify-between">
          <Wordmark />
          <p className="flex items-center gap-2 text-xs text-muted print:hidden">
            <LockIcon className="size-4" />
            <span className="hidden sm:inline">Pago seguro con Stripe</span>
            <span className="sm:hidden">Pago seguro</span>
          </p>
        </div>
      </header>

      <div id="contenido" className="flex flex-1 flex-col">
        {children}
      </div>

      <footer className="mt-auto border-t border-border/70 print:hidden">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-[1.2fr_1fr_1fr] lg:gap-14">
          <div className="space-y-4 sm:col-span-2 lg:col-span-1">
            <Wordmark />
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              {business.legalName}, titular de la marca inttimo.
            </p>
          </div>

          <nav aria-labelledby="pie-legal">
            <h2 id="pie-legal" className="eyebrow text-muted">
              Legal
            </h2>
            <ul className="mt-3 text-sm sm:mt-4 sm:space-y-1">
              {legalDocuments.map((doc) => (
                <li key={doc.slug}>
                  <Link href={`/${doc.slug}`} className="inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:underline sm:min-h-0 sm:py-1.5">
                    {doc.shortTitle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="pie-ayuda">
            <h2 id="pie-ayuda" className="eyebrow text-muted">
              Ayuda y soporte
            </h2>
            <ul className="mt-4 space-y-1 text-sm">
              <li>
                <a href={`mailto:${business.email}`} className="inline-flex min-h-11 items-center gap-2.5 py-1.5 break-all underline-offset-4 hover:underline">
                  <MailIcon className="size-4 shrink-0 text-muted" />
                  {business.email}
                </a>
              </li>
              <li>
                <a href={business.whatsappUrl} className="inline-flex min-h-11 items-center gap-2.5 py-1.5 underline-offset-4 hover:underline" rel="noopener">
                  <ChatIcon className="size-4 shrink-0 text-muted" />
                  WhatsApp {business.whatsapp}
                </a>
              </li>
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Horario: {business.hours}.
              <br />
              Respuesta: {business.responseTime}.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Cambios, daños o reembolsos: consulta la{" "}
              <Link href="/cambios-y-reembolsos" className="underline underline-offset-4 hover:text-fg">
                Política de Cambios y Reembolsos
              </Link>
              .
            </p>
          </section>
        </div>
        <div className="border-t border-border/70">
          <p className="container-page py-5 text-xs text-muted">© {new Date().getFullYear()} inttimo. Todos los derechos reservados.</p>
        </div>
      </footer>
    </>
  );
}
