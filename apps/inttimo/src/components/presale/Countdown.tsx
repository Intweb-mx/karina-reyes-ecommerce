"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  /** ISO de la fecha objetivo (cierre si está abierta, inicio si aún no abre). */
  target: string;
  /** Hora del servidor al renderizar, para corregir relojes desfasados. */
  serverTime: string;
  label: string;
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

export function Countdown({ target, serverTime, label }: Props) {
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

  return (
    <div>
      <p className="text-xs tracking-[0.2em] text-muted uppercase">{label}</p>
      <div className="mt-3 flex gap-3 sm:gap-5" role="timer" aria-live="off">
        {parts.map((part) => (
          <div key={part.key} className="min-w-16 border border-border bg-surface px-3 py-3 text-center sm:min-w-20">
            <span className="block font-serif text-3xl tabular-nums sm:text-4xl">{String(part.value).padStart(2, "0")}</span>
            <span className="mt-1 block text-[0.65rem] tracking-[0.18em] text-muted uppercase">{part.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
