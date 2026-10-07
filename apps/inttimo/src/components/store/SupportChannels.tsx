import Link from "next/link";
import { ChatIcon, ClockIcon, MailIcon } from "@/components/ui/icons";
import { business } from "@/content/legal";

/** Canales de atención reales (content/legal/business.ts). */
export function SupportChannels({ withChurch }: { withChurch?: boolean }) {
  const items = [
    { icon: ChatIcon, title: "WhatsApp", body: business.whatsapp, href: business.whatsappUrl },
    { icon: MailIcon, title: "Correo electrónico", body: business.email, href: `mailto:${business.email}` },
    { icon: ClockIcon, title: "Horario de atención", body: `${business.hours}. Respuesta: ${business.responseTime}.`, href: null },
  ];
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map(({ icon: Icon, title, body, href }) => {
        const inner = (
          <>
            <Icon className="mt-0.5 size-5 shrink-0 text-fg/70" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-sm break-words text-muted">{body}</span>
            </span>
            {href && <span aria-hidden="true" className="text-muted">→</span>}
          </>
        );
        return (
          <li key={title}>
            {href ? (
              <a href={href} rel="noopener" className="flex items-start gap-4 py-4 transition-colors hover:text-fg">{inner}</a>
            ) : (
              <div className="flex items-start gap-4 py-4">{inner}</div>
            )}
          </li>
        );
      })}
      {withChurch && (
        <li className="py-4 text-sm">
          ¿Eres iglesia o ministerio? <Link href="/iglesias#cotizacion" className="font-semibold underline underline-offset-4">Solicita una cotización</Link>
        </li>
      )}
    </ul>
  );
}
