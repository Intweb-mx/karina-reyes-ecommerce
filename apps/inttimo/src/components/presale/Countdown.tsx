"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

type Props = {
  /** ISO de la fecha objetivo (cierre si está abierta, inicio si aún no abre). */
  target: string;
  /** Hora del servidor al renderizar, para corregir relojes desfasados. */
  serverTime: string;
  label: string;
  /** Texto accesible con la fecha completa (el contador en sí no se anuncia cada segundo). */
  description?: string;
  /** Encabezado sobre el contador (p. ej. "Preventa UNO+UNO"). */
  heading?: string;
  tone?: "light" | "ink";
  /** Muestra el indicador "En vivo" (solo con la preventa abierta). */
  live?: boolean;
};

const UNITS = [
  { key: "days", label: "Días", ms: 86_400_000 },
  { key: "hours", label: "Horas", ms: 3_600_000 },
  { key: "minutes", label: "Min", ms: 60_000 },
  { key: "seconds", label: "Seg", ms: 1_000 },
] as const;

function split(remaining: number) {
  let rest = Math.max(0, remaining);
  return UNITS.map((unit) => {
    const value = Math.floor(rest / unit.ms);
    rest -= value * unit.ms;
    return { ...unit, value };
  });
}

export function Countdown({ target, serverTime, label, description, heading, tone = "light", live = false }: Props) {
  const router = useRouter();
  const targetMs = new Date(target).getTime();
  const serverMs = new Date(serverTime).getTime();
  // Hora actual corregida con el reloj del servidor. null hasta montar: el HTML del servidor y el primer render coinciden.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const offset = serverMs - Date.now();
    const tick = () => {
      const current = Date.now() + offset;
      setNow(current);
      if (targetMs - current <= 0) {
        clearInterval(id);
        router.refresh();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [targetMs, serverMs, router]);

  const current = now ?? serverMs;
  const parts = split(targetMs - current);
  const ink = tone === "ink";
  const muted = ink ? "text-on-ink-muted" : "text-muted";
  // Con 3 o más dígitos de días se reduce el tamaño para que las cuatro cifras mantengan proporción.
  const long = parts[0]!.value >= 100;
  // Tamaño relativo al ancho del propio contador (container query), no de la ventana: nunca se desborda de la tarjeta.
  const digitSize = long ? "text-[clamp(1.75rem,12.5cqi,3.25rem)]" : "text-[clamp(2rem,15cqi,3.75rem)]";

  return (
    <div className="@container">
      <div className="flex items-center justify-between gap-4">
        <p className={`eyebrow whitespace-nowrap ${muted}`}>{heading ?? label}</p>
        {live && (
          <span className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[0.625rem] font-semibold tracking-[0.2em] uppercase ${muted}`}>
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-success" />
          </span>
          En vivo
          </span>
        )}
      </div>
      {description && <p className="sr-only">{description}</p>}
      {heading && <p className={`mt-6 text-[0.625rem] font-semibold tracking-[0.24em] uppercase ${muted}`}>{label}</p>}

      <div className={`${heading ? "mt-3" : "mt-6"} flex items-start justify-between`} role="timer" aria-live="off">
        {parts.map((part, index) => (
          <Fragment key={part.key}>
            {index > 0 && (
              <span aria-hidden="true" className={`px-[1.5cqi] font-serif leading-none ${digitSize} ${ink ? "text-on-ink/25" : "text-fg/20"}`}>
                :
              </span>
            )}
            <div className="flex min-w-0 flex-col items-center">
              <span className={`block overflow-hidden font-serif leading-none font-medium lining-nums tabular-nums ${digitSize} ${index === 3 ? (ink ? "text-on-ink/80" : "text-fg/80") : ""}`}>
                <span key={part.value} className={`block ${index === 3 ? "animate-tick" : ""}`}>
                  {String(part.value).padStart(2, "0")}
                </span>
              </span>
              <span className={`mt-3 block text-[0.625rem] font-semibold tracking-[0.22em] uppercase ${muted}`}>{part.label}</span>
            </div>
          </Fragment>
        ))}
      </div>

    </div>
  );
}
