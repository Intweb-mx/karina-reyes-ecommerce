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
  /** ISO del inicio del periodo: si se indica, se muestra el avance entre `start` y `target`. */
  start?: string;
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

export function Countdown({ target, serverTime, label, description, start, tone = "light", live = false }: Props) {
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
  const digitSize = long ? "text-[clamp(2.25rem,6vw,3.25rem)]" : "text-[clamp(2.5rem,7vw,3.75rem)]";

  const startMs = start ? new Date(start).getTime() : null;
  const progress = startMs !== null && targetMs > startMs ? Math.min(100, Math.max(0, ((current - startMs) / (targetMs - startMs)) * 100)) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className={`eyebrow ${muted}`}>{label}</p>
        {live && (
          <span className={`inline-flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.2em] uppercase ${muted}`}>
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-success" />
          </span>
          En vivo
          </span>
        )}
      </div>
      {description && <p className="sr-only">{description}</p>}

      <div className="mt-6 flex items-start justify-between" role="timer" aria-live="off">
        {parts.map((part, index) => (
          <Fragment key={part.key}>
            {index > 0 && (
              <span aria-hidden="true" className={`font-serif leading-none ${digitSize} ${ink ? "text-on-ink/25" : "text-fg/20"}`}>
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

      {progress !== null && (
        <div className="mt-8">
          <div
            role="progressbar"
            aria-label="Avance de la preventa"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className={`relative h-[3px] overflow-hidden ${ink ? "bg-on-ink/12" : "bg-sand"}`}
          >
            <div className={`absolute inset-y-0 left-0 transition-[width] duration-1000 ease-soft ${ink ? "bg-on-ink" : "bg-fg"}`} style={{ width: `${Math.max(progress, 1.5)}%` }} />
          </div>
          <p className={`mt-2.5 text-right text-[0.6875rem] lining-nums ${muted}`}>{Math.round(progress)}% del periodo transcurrido</p>
        </div>
      )}
    </div>
  );
}
