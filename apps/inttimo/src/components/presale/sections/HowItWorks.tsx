import { BoxIcon, LockIcon, MailIcon } from "@/components/ui/icons";
import { steps, trust } from "@/content/presale";

const TRUST_ICONS = { lock: LockIcon, mail: MailIcon, box: BoxIcon };

type Props = { productName: string; maxQuantity: number; days: number; launch?: string };

/** "Cómo funciona tu preventa" (3 pasos) + sellos de confianza (brief §8). */
export function HowItWorks(props: Props) {
  return (
    <section aria-labelledby="como-funciona" className="space-y-10">
      <div>
        <h2 id="como-funciona" className="eyebrow text-muted">
          Cómo funciona tu preventa
        </h2>
        <ol className="mt-7 grid gap-8 sm:grid-cols-3 sm:gap-0">
          {steps(props).map((step, index) => (
            <li key={step.title} className={`flex gap-5 sm:block sm:px-6 ${index === 0 ? "sm:pl-0" : "sm:border-l sm:border-border"}`}>
              <span aria-hidden="true" className="font-serif text-4xl leading-none text-fg/35 lining-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="sm:mt-4">
                <h3 className="font-serif text-2xl leading-tight font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted lining-nums">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <ul aria-label="Garantías" className="grid gap-px border border-border bg-border sm:grid-cols-3">
        {trust.map((item) => {
          const Icon = TRUST_ICONS[item.key];
          return (
            <li key={item.key} className="flex gap-3.5 bg-surface px-5 py-5">
              <Icon className="mt-0.5 size-5 shrink-0 text-fg/70" />
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
