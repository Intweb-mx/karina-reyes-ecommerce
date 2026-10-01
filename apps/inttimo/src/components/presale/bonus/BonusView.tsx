import Image from "next/image";
import type { ReactNode } from "react";
import { business } from "@/content/legal";
import { getProductContent } from "@/content/products";
import { AlertIcon, ArrowRightIcon, ChatIcon, ClockIcon, FileIcon, GiftIcon, MailIcon, PlayIcon } from "@/components/ui/icons";

export type BonusViewState =
  | { status: "ok"; productName: string; bonus: { title: string; pdfUrl: string | null; videoUrl: string | null }; expiresAt: Date; now: Date }
  | { status: "expired"; productName: string }
  | { status: "invalid" };

const until = (date: Date) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(date);

/**
 * Página personal del bonus digital de preventa (enlace temporal enviado por correo).
 * Válido: recursos como tarjetas grandes y vigencia visible. Expirado o inválido: explicación + canales de ayuda.
 */
export function BonusView({ state }: { state: BonusViewState }) {
  if (state.status !== "ok") {
    const expired = state.status === "expired";
    return (
      <div className="mx-auto max-w-xl border border-border bg-[#fffdf9] px-6 py-10 text-center shadow-[0_24px_48px_-32px_rgb(34_28_23/0.35)] max-sm:-mx-4 max-sm:border-x-0 sm:px-10 sm:py-12">
        <span aria-hidden="true" className={`mx-auto grid size-14 place-items-center rounded-full ${expired ? "bg-sand text-warning" : "bg-danger/10 text-danger"}`}>
          {expired ? <ClockIcon className="size-6" /> : <AlertIcon className="size-6" />}
        </span>
        <p className="eyebrow mt-6 text-muted">{expired ? `Bonus · ${state.productName}` : "Bonus de preventa"}</p>
        <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3rem)] leading-[1.05] font-medium text-balance">{expired ? "Este enlace ya expiró." : "Este enlace no es válido."}</h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">
          {expired
            ? "El acceso a tu bonus era temporal. Si aún no lo descargaste, escríbenos con tu número de pedido y lo revisamos."
            : "Revisa que hayas abierto el enlace completo desde tu correo. Si crees que es un error, escríbenos con tu número de pedido."}
        </p>
        <HelpButtons />
      </div>
    );
  }

  const { bonus, productName, expiresAt, now } = state;
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
  const image = getProductContent("uno-mas-uno")?.bonus?.image;

  return (
    <div className="mx-auto max-w-4xl">
      <section className="grid overflow-hidden border border-border bg-[#fffdf9] shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] max-sm:-mx-4 max-sm:border-x-0 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="px-6 py-8 sm:px-10 sm:py-12">
          <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.22em] text-muted uppercase">
            <GiftIcon className="size-4 text-bronze" />
            Bonus exclusivo de preventa · {productName}
          </p>
          <h1 className="mt-5 font-serif text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] font-medium text-balance">{bonus.title}</h1>
          <p className="mt-4 leading-relaxed text-muted">Gracias por ser parte de la preventa. Este contenido es para ustedes: descárguenlo y disfrútenlo juntos.</p>

          <p className="mt-6 inline-flex items-center gap-2 border border-border bg-surface px-3 py-2 text-sm">
            <ClockIcon className="size-4 text-fg/60" />
            <span>
              {daysLeft <= 1 ? "Disponible hasta hoy" : `Disponible ${daysLeft} días más`} · <span className="text-muted lining-nums">hasta el {until(expiresAt)}</span>
            </span>
          </p>
        </div>
        {image && (
          <div className="relative min-h-56 bg-sand max-md:aspect-[16/10]">
            <Image src={image.src} alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
          </div>
        )}
      </section>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {bonus.pdfUrl && (
          <Resource href={bonus.pdfUrl} icon={<FileIcon className="size-6" />} kind="Guía en PDF" action="Descargar la guía" note="Ábrela en tu teléfono o imprímela." />
        )}
        {bonus.videoUrl && (
          <Resource href={bonus.videoUrl} icon={<PlayIcon className="size-6" />} kind="Video" action="Ver el video especial" note="Mejor con audífonos o en un momento tranquilo." />
        )}
      </ul>

      <p className="mt-8 text-center text-xs leading-relaxed text-muted">
        Enlace personal. El contenido es para tu uso personal; no está permitida su reproducción ni distribución.
      </p>
    </div>
  );
}

function Resource({ href, icon, kind, action, note }: { href: string; icon: ReactNode; kind: string; action: string; note: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex h-full items-start gap-4 border border-border bg-[#fffdf9] p-5 transition-[border-color,box-shadow,transform] duration-(--duration-base) ease-soft hover:-translate-y-0.5 hover:border-fg/40 hover:shadow-[0_18px_36px_-24px_rgb(34_28_23/0.55)] sm:p-6"
      >
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-on-ink">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-muted">{kind}</span>
          <span className="mt-1.5 flex items-center justify-between gap-3 font-serif text-2xl leading-tight font-medium">
            {action}
            <ArrowRightIcon className="size-5 shrink-0 transition-transform duration-(--duration-base) group-hover:translate-x-1" />
          </span>
          <span className="mt-1.5 block text-sm text-muted">{note}</span>
        </span>
      </a>
    </li>
  );
}

function HelpButtons() {
  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <a href={`mailto:${business.email}`} className="inline-flex min-h-12 items-center justify-center gap-2 border border-fg/80 px-5 text-sm font-medium transition-colors hover:bg-fg hover:text-bg">
          <MailIcon className="size-4" />
          Escríbenos por correo
        </a>
        <a href={business.whatsappUrl} rel="noopener" className="inline-flex min-h-12 items-center justify-center gap-2 border border-fg/80 px-5 text-sm font-medium transition-colors hover:bg-fg hover:text-bg">
          <ChatIcon className="size-4" />
          WhatsApp {business.whatsapp}
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">
        Horario: {business.hours}. Respuesta: {business.responseTime}.
      </p>
    </div>
  );
}
