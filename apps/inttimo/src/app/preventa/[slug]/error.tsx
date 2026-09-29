"use client";

import { useEffect } from "react";
import { StateMessage } from "@/components/presale/sections/StateMessage";
import { Button } from "@/components/ui/Button";

/** Falla inesperada al cargar la preventa (p. ej. base de datos no disponible): nunca se muestra como éxito. */
export default function PresaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container-page flex flex-1 flex-col justify-center py-24">
      <StateMessage as="h1" eyebrow="Preventa" title="No pudimos cargar la preventa." body="Es un problema temporal de nuestro lado. Intenta de nuevo en unos minutos; tu información no se ha enviado.">
        <Button type="button" arrow="right" onClick={() => retry()}>
          Reintentar
        </Button>
      </StateMessage>
      {error.digest && <p className="mt-6 text-center text-xs text-muted">Referencia: {error.digest}</p>}
    </main>
  );
}
