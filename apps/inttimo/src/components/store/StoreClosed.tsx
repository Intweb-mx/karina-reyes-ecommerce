import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { pendingBackendEnabled, storeEnabled } from "@/lib/store/flags";
import { PageHero } from "./PageHero";
import { SupportChannels } from "./SupportChannels";

/** Muestra `children` con la tienda abierta; si solo está abierto el sitio informativo, muestra `closed`. */
export function WhenStoreOpen({ children, closed }: { children: ReactNode; closed: ReactNode }) {
  return storeEnabled ? children : closed;
}

/** Muestra `children` solo si la función ya puede responder (hoy, con el simulador); si no, muestra `closed`. */
export function WhenBackendReady({ children, closed }: { children: ReactNode; closed: ReactNode }) {
  return pendingBackendEnabled ? children : closed;
}

/** Página de una función de compra que aún no abre: dice qué es y deja los canales reales de atención (sin fechas inventadas). */
export function StoreClosed({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <main>
      <PageHero eyebrow={eyebrow} title={title} body={body} size="sm" />
      <div className="container-page section-y max-w-xl">
        <h2 className="font-serif text-2xl font-medium">¿Necesitas algo mientras tanto?</h2>
        <div className="mt-4">
          <SupportChannels />
        </div>
        <div className="mt-10">
          <ButtonLink href="/" variant="outline" arrow={false}>Volver al inicio</ButtonLink>
        </div>
      </div>
    </main>
  );
}
