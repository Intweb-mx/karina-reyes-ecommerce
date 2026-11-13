import type { StoreDownloadState } from "@inttimo/database";
import { business } from "@/content/legal";
import { AlertIcon, ChatIcon, CheckIcon, FileIcon, MailIcon } from "@/components/ui/icons";
import { DownloadButton } from "./DownloadButton";

const COPY = {
  used: { title: "Este enlace ya se usó.", body: "El archivo ya se descargó con este enlace, que sirve una sola vez. Si lo perdiste o la descarga falló, escríbenos con tu número de pedido y te mandamos un enlace nuevo." },
  revoked: { title: "Este enlace ya no está activo.", body: "Te enviamos un enlace más reciente: búscalo en tu correo. Si no lo encuentras, escríbenos con tu número de pedido." },
  unpaid: { title: "Esta descarga no está disponible.", body: "El pedido no tiene un pago vigente. Si crees que es un error, escríbenos con tu número de pedido." },
  invalid: { title: "Este enlace no es válido.", body: "Revisa que hayas abierto el enlace completo desde tu correo. Si crees que es un error, escríbenos con tu número de pedido." },
} as const;

/**
 * Página del enlace de descarga (un solo uso). Abrirla no gasta el enlace: solo pulsar "Descargar" (POST). Así los
 * revisores de enlaces del correo no consumen la descarga.
 */
export function DownloadView({ state, token }: { state: StoreDownloadState; token: string }) {
  if (state.status !== "ready") {
    const copy = COPY[state.status];
    return (
      <Card>
        <span aria-hidden="true" className={`mx-auto grid size-14 place-items-center rounded-full ${state.status === "used" ? "bg-sand text-success" : "bg-danger/10 text-danger"}`}>
          {state.status === "used" ? <CheckIcon className="size-6" /> : <AlertIcon className="size-6" />}
        </span>
        <p className="eyebrow mt-6 text-muted">{"productName" in state ? `Descarga · ${state.productName}` : "Descarga digital"}</p>
        <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3rem)] leading-[1.05] font-medium text-balance">{copy.title}</h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">{copy.body}</p>
        {"orderNumber" in state && <p className="mt-3 text-sm">Pedido <span className="font-mono">{state.orderNumber}</span></p>}
        <HelpButtons />
      </Card>
    );
  }

  return (
    <Card>
      <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-sand text-bronze">
        <FileIcon className="size-6" />
      </span>
      <p className="eyebrow mt-6 text-muted">Tu descarga · Pedido <span className="font-mono">{state.orderNumber}</span></p>
      <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3rem)] leading-[1.05] font-medium text-balance">{state.productName}</h1>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">
        Este enlace sirve <strong className="text-fg">una sola vez</strong>. Descárgalo en el dispositivo donde lo vas a leer y guárdalo: al pulsar el botón, el enlace
        deja de funcionar.
      </p>
      <DownloadButton token={token} />
      <p className="mt-6 text-xs leading-relaxed text-muted">El contenido es para tu uso personal; no está permitida su reproducción ni distribución.</p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl border border-border bg-[#fffdf9] px-6 py-10 text-center shadow-[0_24px_48px_-32px_rgb(34_28_23/0.35)] max-sm:-mx-4 max-sm:border-x-0 sm:px-10 sm:py-12">
      {children}
    </div>
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
