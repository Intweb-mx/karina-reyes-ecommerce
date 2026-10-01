import Link from "next/link";
import { business, legalPaths } from "@/content/legal";
import { stateCopy } from "@/content/presale";
import { BoxIcon, CalendarIcon, ChatIcon, MailIcon } from "@/components/ui/icons";
import { formatCalendarDate } from "@/lib/format";

/**
 * Estado "agotado" (campaign.soldOut): sin formulario ni CTA de compra. Explica qué pasó, recuerda la fecha
 * de lanzamiento (si existe) y deja a la mano los canales de atención. No promete reabastecimiento.
 */
export function SoldOutPanel({ id, launchDate }: { id: string; launchDate?: string }) {
  return (
    <div className="mx-auto max-w-2xl border border-border bg-[#fffdf9] px-6 py-10 text-center shadow-[0_24px_48px_-32px_rgb(34_28_23/0.35)] max-sm:-mx-4 max-sm:border-x-0 sm:px-12 sm:py-14">
      <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-sand text-fg/70">
        <BoxIcon className="size-6" />
      </span>
      <p className="eyebrow mt-6 text-muted">{stateCopy.soldOutCard.badge}</p>
      <h2 id={id} className="mt-3 font-serif text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05] font-medium text-balance">
        {stateCopy.soldOut.title}
      </h2>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">{stateCopy.soldOut.body}</p>

      {launchDate && (
        <p className="mx-auto mt-8 inline-flex items-center gap-3 border border-border bg-surface px-4 py-3 text-left text-sm">
          <CalendarIcon className="size-5 shrink-0 text-fg/60" />
          <span>
            <span className="block text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">Lanzamiento oficial</span>
            <span className="font-medium lining-nums">{formatCalendarDate(launchDate)}</span>
          </span>
        </p>
      )}

      <div className="mt-10 border-t border-border pt-8">
        <p className="text-sm font-semibold">¿Tienes dudas sobre tu compra o la preventa?</p>
        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={`mailto:${business.email}`} className="inline-flex min-h-12 items-center justify-center gap-2 border border-fg/80 px-5 text-sm font-medium transition-colors hover:bg-fg hover:text-bg">
            <MailIcon className="size-4" />
            Escríbenos por correo
          </a>
          <a href={business.whatsappUrl} rel="noopener" className="inline-flex min-h-12 items-center justify-center gap-2 border border-fg/80 px-5 text-sm font-medium transition-colors hover:bg-fg hover:text-bg">
            <ChatIcon className="size-4" />
            WhatsApp {business.whatsapp}
          </a>
        </div>
        <p className="mt-4 text-xs text-muted">
          Horario: {business.hours}. Respuesta: {business.responseTime}.{" "}
          <Link href={legalPaths.refunds} className="underline underline-offset-4 hover:text-fg">
            Política de Cambios y Reembolsos
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
