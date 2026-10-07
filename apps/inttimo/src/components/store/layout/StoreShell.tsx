import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/Wordmark";
import { ChatIcon, MailIcon } from "@/components/ui/icons";
import { business, legalDocuments } from "@/content/legal";
import { nav } from "@/content/store";
import { CartDrawer } from "../cart/CartDrawer";
import { CartProvider } from "../cart/CartProvider";
import { NewsletterForm } from "../forms/NewsletterForm";
import { DemoNotice } from "../DemoNotice";
import { StoreHeader } from "./StoreHeader";

/** Marco global de la tienda: header, contenido, comunidad (newsletter) y pie con navegación, ayuda y legales. */
export function StoreShell({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-bg">
        Saltar al contenido
      </a>
      <DemoNotice />
      <StoreHeader />
      <CartDrawer />
      <div id="contenido" className="flex flex-1 flex-col">
        {children}
      </div>

      <section aria-labelledby="comunidad" className="surface-ink bg-ink text-on-ink print:hidden">
        <div className="container-page grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-center md:py-14">
          <div>
            <h2 id="comunidad" className="font-serif text-3xl font-medium sm:text-4xl">Sé parte de esta comunidad.</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-on-ink-muted">Recibe inspiración, lanzamientos y recursos para tu matrimonio.</p>
          </div>
          <NewsletterForm source="footer" />
        </div>
      </section>

      <footer className="border-t border-border/70 print:hidden">
        <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <Wordmark />
            <p className="max-w-xs text-xs leading-relaxed text-muted">Herramientas para matrimonios que quieren seguir cultivando lo que pasa entre ellos.</p>
          </div>
          <FooterNav title="Explora" links={[...nav, { href: "/rastrear-pedido", label: "Rastrear pedido" }]} />
          <FooterNav title="Ayuda" links={[{ href: "/ayuda", label: "Preguntas frecuentes" }, { href: "/contacto", label: "Contacto" }, { href: "/cuenta", label: "Mi cuenta" }]} />
          <FooterNav title="Legal" links={legalDocuments.map((doc) => ({ href: `/${doc.slug}`, label: doc.shortTitle }))} />
        </div>
        <div className="border-t border-border/70">
          <div className="container-page flex flex-col gap-3 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} inttimo. Todos los derechos reservados.</p>
            <p className="flex flex-wrap gap-4">
              <a href={`mailto:${business.email}`} className="inline-flex items-center gap-1.5 hover:text-fg"><MailIcon className="size-3.5" />{business.email}</a>
              <a href={business.whatsappUrl} rel="noopener" className="inline-flex items-center gap-1.5 hover:text-fg"><ChatIcon className="size-3.5" />WhatsApp {business.whatsapp}</a>
            </p>
          </div>
        </div>
      </footer>
    </CartProvider>
  );
}

function FooterNav({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="eyebrow text-muted">{title}</h2>
      <ul className="mt-4 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="inline-flex min-h-10 items-center underline-offset-4 hover:underline sm:min-h-0 sm:py-1.5">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
