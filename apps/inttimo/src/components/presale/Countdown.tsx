"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  /** ISO de la fecha objetivo (cierre si está abierta, inicio si aún no abre). */
  target: string;
  /** Hora del servidor al renderizar, para corregir relojes desfasados. */
  serverTime: string;
  label: string;
  /** Texto accesible con la fecha completa (el contador en sí no se anuncia cada segundo). */
  description?: string;
  tone?: "light" | "ink";
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

export function Countdown({ target, serverTime, label, description, tone = "light" }: Props) {
  const router = useRouter();
  const targetMs = new Date(target).getTime();
  // null hasta montar: el HTML del servidor y el primer render del cliente coinciden.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const offset = new Date(serverTime).getTime() - Date.now();
    const tick = () => {
      const left = targetMs - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        router.refresh();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [targetMs, serverTime, router]);

  const parts = split(remaining ?? targetMs - new Date(serverTime).getTime());
  const ink = tone === "ink";

  return (
    <div>
      <p className={`eyebrow ${ink ? "text-on-ink-muted" : "text-muted"}`}>{label}</p>
      {description && <p className="sr-only">{description}</p>}
      <div className="mt-4 grid grid-cols-4" role="timer" aria-live="off">
        {parts.map((part, index) => (
          <div key={part.key} className={`px-1 text-center ${index > 0 ? (ink ? "border-l border-on-ink/15" : "border-l border-border") : ""}`}>
            <span key={part.value} className="animate-tick block font-serif text-4xl leading-none font-medium lining-nums tabular-nums sm:text-5xl">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className={`mt-2 block text-[0.625rem] font-semibold tracking-[0.2em] uppercase ${ink ? "text-on-ink-muted" : "text-muted"}`}>{part.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
