"use client";

import { useState } from "react";
import { AlertIcon, PlayIcon } from "@/components/ui/icons";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "exhausted" } | { kind: "error"; message: string };

type Props = { token: string; playsLeft: number; maxPlays: number; helpHref: string };

/** La URL firmada dura 1 h; se guarda 55 min para que recargar la página no gaste otra reproducción. */
const KEEP_MS = 55 * 60_000;
const storageKey = (token: string) => `inttimo-bonus-video:${token}`;

function loadKept(token: string): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey(token));
    if (!raw) return null;
    const kept = JSON.parse(raw) as { url?: string; until?: number };
    return kept.url && kept.until && kept.until > Date.now() ? kept.url : null;
  } catch {
    return null;
  }
}

/** Reproductor del bonus: pide la URL temporal al servidor, que cuenta y limita las reproducciones por enlace. */
export function BonusVideo({ token, playsLeft: initialLeft, maxPlays, helpHref }: Props) {
  const [left, setLeft] = useState(initialLeft);
  const [status, setStatus] = useState<Status>(initialLeft <= 0 ? { kind: "exhausted" } : { kind: "idle" });

  async function play() {
    // Si en esta sesión ya hay una URL vigente (p. ej. recargó la página), se reutiliza sin gastar otra reproducción.
    const kept = loadKept(token);
    if (kept) {
      setStatus({ kind: "ready", url: kept });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`/bonus/${encodeURIComponent(token)}/video`, { method: "POST", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { url?: string; playsLeft?: number; error?: { code?: string; message?: string } } | null;
      if (response.ok && body?.url) {
        setLeft(body.playsLeft ?? 0);
        try {
          sessionStorage.setItem(storageKey(token), JSON.stringify({ url: body.url, until: Date.now() + KEEP_MS }));
        } catch {
          /* sin almacenamiento de sesión: funciona igual, solo gastaría una reproducción al recargar */
        }
        setStatus({ kind: "ready", url: body.url });
        return;
      }
      if (body?.error?.code === "plays_exhausted") {
        setLeft(0);
        setStatus({ kind: "exhausted" });
        return;
      }
      setStatus({ kind: "error", message: body?.error?.message ?? "No pudimos cargar el video. No se descontó ninguna reproducción; inténtalo de nuevo." });
    } catch {
      setStatus({ kind: "error", message: "No pudimos cargar el video. Revisa tu conexión e inténtalo de nuevo; no se descontó ninguna reproducción." });
    }
  }

  const plural = left === 1 ? "reproducción" : "reproducciones";

  if (status.kind === "ready") {
    return (
      <div className="border border-border bg-[#fffdf9] p-3 sm:p-4">
        <video
          src={status.url}
          controls
          autoPlay
          playsInline
          preload="metadata"
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          className="aspect-video w-full bg-ink"
        >
          Tu navegador no puede reproducir este video.
        </video>
        <p className="mt-3 text-sm text-muted" role="status">
          {left > 0 ? `Te ${left === 1 ? "queda" : "quedan"} ${left} ${plural} después de esta.` : "Esta fue tu última reproducción."} Puedes pausarlo y seguir viéndolo mientras no cierres la página.
        </p>
      </div>
    );
  }

  if (status.kind === "exhausted") {
    return (
      <div className="flex h-full items-start gap-4 border border-border bg-[#fffdf9] p-5 sm:p-6" role="status">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-sand text-warning">
          <AlertIcon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-muted">Video</span>
          <span className="mt-1.5 block font-serif text-2xl leading-tight font-medium">Ya usaste tus {maxPlays} reproducciones.</span>
          <span className="mt-1.5 block text-sm text-muted">
            Si algo falló o necesitas verlo otra vez, <a href={helpHref} className="underline underline-offset-2">escríbenos con tu número de pedido</a>.
          </span>
        </span>
      </div>
    );
  }

  const loading = status.kind === "loading";
  return (
    <div>
      <button
        type="button"
        onClick={play}
        disabled={loading}
        className="group flex h-full w-full items-start gap-4 border border-border bg-[#fffdf9] p-5 text-left transition-[border-color,box-shadow,transform] duration-(--duration-base) ease-soft hover:-translate-y-0.5 hover:border-fg/40 hover:shadow-[0_18px_36px_-24px_rgb(34_28_23/0.55)] disabled:opacity-70 sm:p-6"
      >
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-on-ink">
          <PlayIcon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block text-muted">Video</span>
          <span className="mt-1.5 block font-serif text-2xl leading-tight font-medium">{loading ? "Cargando…" : "Ver el video especial"}</span>
          <span className="mt-1.5 block text-sm text-muted">
            Puedes verlo {maxPlays} veces. Cada vez que lo abres cuenta una (mientras no cierres la pestaña, volver a abrirlo no gasta otra); te {left === 1 ? "queda" : "quedan"} {left} {plural}.
          </span>
        </span>
      </button>
      {status.kind === "error" && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {status.message}
        </p>
      )}
    </div>
  );
}
