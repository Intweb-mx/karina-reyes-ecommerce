import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, ClockIcon } from "./icons";

type Tone = "info" | "warning" | "danger" | "success";

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-border bg-surface text-fg", icon: <AlertIcon className="size-5 text-muted" /> },
  warning: { box: "border-warning/30 bg-warning/5 text-fg", icon: <ClockIcon className="size-5 text-warning" /> },
  danger: { box: "border-danger/30 bg-danger/5 text-danger", icon: <AlertIcon className="size-5" /> },
  success: { box: "border-success/30 bg-success/5 text-fg", icon: <CheckIcon className="size-5 text-success" /> },
};

/** Aviso en línea. `role` decide si se anuncia de inmediato (alert) o con cortesía (status). */
export function Notice({ tone = "info", title, children, role, className = "" }: { tone?: Tone; title?: string; children?: ReactNode; role?: "alert" | "status"; className?: string }) {
  return (
    <div role={role} className={`flex items-start gap-3 border px-5 py-4 text-sm leading-relaxed ${tones[tone].box} ${className}`}>
      <span className="mt-px shrink-0">{tones[tone].icon}</span>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
    </div>
  );
}
