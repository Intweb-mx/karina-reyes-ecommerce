"use client";

import { useState } from "react";
import { FileIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";

/** Gasta el enlace (POST) y abre la descarga. Si ya no sirve, recarga la página para mostrar por qué. */
export function DownloadButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function download() {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const response = await fetch(`/descarga/${encodeURIComponent(token)}/archivo`, { method: "POST", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { url?: string } | null;
      if (response.ok && body?.url) {
        setState("done");
        window.location.assign(body.url);
        return;
      }
      if (response.status === 409) {
        window.location.reload();
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={download}
        disabled={state === "loading" || state === "done"}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-ink px-6 text-sm font-semibold text-on-ink transition-colors hover:bg-ink/90 disabled:opacity-70 sm:w-auto"
      >
        {state === "loading" ? <Spinner className="size-4" /> : <FileIcon className="size-4" />}
        {state === "loading" ? "Preparando tu descarga…" : state === "done" ? "Descarga iniciada" : "Descargar el PDF"}
      </button>
      <p role="status" className="mt-3 text-sm text-muted">
        {state === "done" && "Si la descarga no empezó, revisa la carpeta de descargas de tu dispositivo o escríbenos."}
        {state === "error" && <span className="text-danger">No pudimos preparar la descarga. Tu enlace sigue activo: inténtalo de nuevo en un momento.</span>}
      </p>
    </div>
  );
}
