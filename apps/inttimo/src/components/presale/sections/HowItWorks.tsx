import { LockIcon, MailIcon, ReceiptIcon } from "@/components/ui/icons";
import { steps, trust } from "@/content/presale";

const TRUST_ICONS = { lock: LockIcon, mail: MailIcon, receipt: ReceiptIcon };

/** Proceso en tres pasos + garantías del flujo de pago. */
export function HowItWorks({ hasQuestions }: { hasQuestions: boolean }) {
  return (
    <section aria-labelledby="como-funciona" className="border-y border-border/70 bg-surface">
      <div className="container-page py-14 sm:py-16">
        <h2 id="como-funciona" className="eyebrow text-muted">
          Cómo funciona
        </h2>
        <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps(hasQuestions).map((step, index) => (
            <li key={step.title} className="flex gap-5 sm:block">
              <span aria-hidden="true" className="font-serif text-3xl leading-none text-fg/40 sm:text-4xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="sm:mt-5 sm:border-t sm:border-border sm:pt-5">
                <h3 className="font-serif text-2xl leading-tight font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul aria-label="Garantías" className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-3">
          {trust.map((item) => {
            const Icon = TRUST_ICONS[item.key];
            return (
              <li key={item.key} className="flex gap-4 bg-bg px-5 py-5">
                <Icon className="mt-0.5 size-5 shrink-0 text-fg/70" />
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
