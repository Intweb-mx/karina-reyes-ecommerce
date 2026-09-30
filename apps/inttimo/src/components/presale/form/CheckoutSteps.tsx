import { CheckIcon } from "@/components/ui/icons";

type Step = { id: string; label: string; done: boolean; detail?: string };

/** Indicador horizontal de pasos del checkout; cada paso lleva a su sección. */
export function CheckoutSteps({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((step) => !step.done);
  return (
    <nav aria-label="Pasos de tu compra">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const state = step.done ? "done" : index === current ? "current" : "todo";
          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center text-center">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-4 right-1/2 left-[-50%] h-px transition-colors duration-500 ${steps[index - 1]!.done ? "bg-success" : "bg-border"}`}
                />
              )}
              <a href={`#${step.id}`} className="group relative z-10 flex flex-col items-center gap-2.5 px-2" aria-current={state === "current" ? "step" : undefined}>
                <span
                  className={`grid size-8 place-items-center rounded-full border text-xs font-semibold lining-nums transition-colors duration-(--duration-base) ${
                    state === "done"
                      ? "border-success bg-success text-on-ink"
                      : state === "current"
                        ? "border-ink bg-ink text-on-ink shadow-[0_0_0_4px_var(--color-sand)]"
                        : "border-border bg-bg text-muted group-hover:border-fg/40"
                  }`}
                >
                  {state === "done" ? <CheckIcon className="animate-pop size-4" /> : index + 1}
                </span>
                <span className={`text-xs font-medium sm:text-sm ${state === "todo" ? "text-muted" : "text-fg"}`}>
                  {step.label}
                  {step.detail && <span className="ml-1 text-muted lining-nums">({step.detail})</span>}
                </span>
                <span className="sr-only">{state === "done" ? "(completo)" : state === "current" ? "(paso actual)" : "(pendiente)"}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
