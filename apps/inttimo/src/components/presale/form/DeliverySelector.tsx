import Link from "next/link";
import type { DeliveryMethod, PublicCampaign } from "@/server/presale/contract";
import { CheckIcon, MapPinIcon, TruckIcon } from "@/components/ui/icons";
import { legalPaths } from "@/content/legal";
import { deliveryCopy } from "@/content/presale";
import { formatMoney } from "@/lib/format";
import { FieldError } from "./fields";

type Props = {
  delivery: PublicCampaign["delivery"];
  currency: string;
  value: DeliveryMethod | null;
  onChange: (method: DeliveryMethod) => void;
  errors?: string[];
  /** Envío ya cotizado y elegido (centavos), para mostrarlo en la tarjeta. */
  shippingAmount?: number | null;
};

/**
 * Selector de entrega: tarjetas grandes con icono, precio a la derecha y explicación.
 * Solo muestra los métodos habilitados en la campaña; con uno solo, se presenta como información (sin elegir).
 */
export function DeliverySelector({ delivery, currency, value, onChange, errors, shippingAmount = null }: Props) {
  const options = [
    delivery.shipping.enabled && {
      method: "shipping" as const,
      icon: TruckIcon,
      title: deliveryCopy.shipping.title,
      price: shippingAmount !== null && shippingAmount > 0 ? formatMoney(shippingAmount, currency) : deliveryCopy.shipping.price,
      body: deliveryCopy.shipping.body,
    },
    delivery.pickup.enabled && {
      method: "pickup" as const,
      icon: MapPinIcon,
      title: deliveryCopy.pickup.title,
      price: deliveryCopy.pickup.price,
      body: deliveryCopy.pickup.body,
    },
  ].filter(Boolean) as { method: DeliveryMethod; icon: typeof TruckIcon; title: string; price: string; body: string }[];

  const invalid = !!errors?.length;

  return (
    <fieldset aria-describedby={invalid ? "deliveryMethod-error" : "deliveryMethod-hint"}>
      <legend className="sr-only">Método de entrega</legend>
      <div className="grid gap-3">
        {options.map((option, index) => {
          const Icon = option.icon;
          const selected = value === option.method;
          const single = options.length === 1;
          return (
            <label
              key={option.method}
              className={`group/delivery relative flex cursor-pointer gap-4 border bg-[#fffdf9] p-4 transition-[border-color,box-shadow,background-color] duration-(--duration-base) ease-soft sm:p-5
                has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-fg
                ${selected ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink),0_14px_30px_-20px_rgb(34_28_23/0.5)]" : invalid ? "border-danger/60" : "border-border hover:border-fg/35"}`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                id={index === 0 ? "deliveryMethod" : undefined}
                value={option.method}
                checked={selected}
                onChange={() => onChange(option.method)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-(--duration-base) ${selected ? "bg-ink text-on-ink" : "bg-sand/80 text-fg/70"}`}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[0.9375rem] leading-snug font-semibold">{option.title}</span>
                  {!single && (
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${selected ? "border-ink bg-ink text-on-ink" : "border-border bg-bg group-hover/delivery:border-fg/40"}`}
                    >
                      {selected && <CheckIcon className="animate-pop size-3" />}
                    </span>
                  )}
                </span>
                <span className={`mt-0.5 block text-sm font-semibold lining-nums ${option.method === "pickup" ? "text-success" : "text-fg/80"}`}>{option.price}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-muted">{option.body}</span>
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id="deliveryMethod" errors={errors} />
      <p id="deliveryMethod-hint" className="mt-3 text-sm">
        <Link href={legalPaths.shipping} target="_blank" rel="noopener" className="text-muted underline underline-offset-4 hover:text-fg">
          {deliveryCopy.policyLink}
        </Link>
      </p>
    </fieldset>
  );
}
