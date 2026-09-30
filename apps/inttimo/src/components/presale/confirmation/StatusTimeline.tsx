import type { PublicReservationStatus } from "@/server/presale/contract";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";

type StepState = "done" | "current" | "failed" | "todo";

/** Etapas derivadas solo del estado real de la reserva (no se inventa seguimiento). */
function stepsFor(status: PublicReservationStatus): { label: string; state: StepState; note?: string }[] {
  const failed = status === "payment_failed" || status === "expired" || status === "canceled";
  return [
    { label: "Pedido creado", state: "done" },
    {
      label: "Pago",
      state: status === "paid" || status === "refunded" ? "done" : failed ? "failed" : "current",
      note: status === "processing" ? "En espera de acreditación" : status === "pending_payment" ? "Confirmando" : failed ? "No completado" : undefined,
    },
    {
      label: status === "refunded" ? "Reembolsada" : "Preventa registrada",
      state: status === "paid" || status === "refunded" ? "done" : "todo",
    },
  ];
}

const DOT: Record<StepState, string> = {
  done: "border-success bg-success text-on-ink",
  current: "border-warning bg-bg text-warning",
  failed: "border-danger bg-danger/10 text-danger",
  todo: "border-border bg-bg text-muted",
};

export function StatusTimeline({ status }: { status: PublicReservationStatus }) {
  const steps = stepsFor(status);
  return (
    <ol aria-label="Estado de tu compra" className="grid grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex flex-col items-center text-center">
          {index > 0 && (
            <span aria-hidden="true" className={`absolute top-3.5 right-1/2 left-[-50%] h-px ${steps[index - 1]!.state === "done" && step.state !== "todo" ? "bg-success" : "bg-border"}`} />
          )}
          <span aria-hidden="true" className={`relative z-10 grid size-7 place-items-center rounded-full border ${DOT[step.state]}`}>
            {step.state === "done" && <CheckIcon className="size-3.5" />}
            {step.state === "failed" && <CloseIcon className="size-3.5" />}
            {step.state === "current" && <span className="size-2 rounded-full bg-warning motion-safe:animate-pulse" />}
          </span>
          <span className={`mt-3 text-xs font-semibold sm:text-sm ${step.state === "todo" ? "text-muted" : ""}`}>{step.label}</span>
          {step.note && <span className="mt-0.5 text-xs text-muted">{step.note}</span>}
          <span className="sr-only">
            {step.state === "done" ? "completado" : step.state === "current" ? "en curso" : step.state === "failed" ? "no completado" : "pendiente"}
          </span>
        </li>
      ))}
    </ol>
  );
}
