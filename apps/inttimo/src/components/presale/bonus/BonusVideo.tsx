"use client";

import { useState } from "react";
import { PlayIcon } from "@/components/ui/icons";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; message: string };

/** Reproductor del bonus: pide la URL temporal al servidor y la reproduce. Sin tope de reproducciones. */
export function BonusVideo({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function play() {
    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`/bonus/${encodeURIComponent(token)}/video`, { method: "POST", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (response.ok && body?.url) {
        setStatus({ kind: "ready", url: body.url });
        return;
      }
      setStatus({ kind: "error", message: body?.error?.message ?? "No pudimos cargar el video. Inténtalo de nuevo." });
    } catch {
      setStatus({ kind: "error", message: "No pudimos cargar el video. Revisa tu conexión e inténtalo de nuevo." });
    }
  }

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
          className="mx-auto max-h-[75vh] w-full bg-ink object-contain"
        >
          Tu navegador no puede reproducir este video.
        </video>
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
          <span className="mt-1.5 block text-sm text-muted">Míralo las veces que quieran, mientras tu enlace esté vigente.</span>
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
