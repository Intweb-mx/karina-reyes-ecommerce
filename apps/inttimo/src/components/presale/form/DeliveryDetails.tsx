"use client";

import type { PickupPointInfo, ShippingQuoteResponse } from "@/server/presale/contract";
import { Button } from "@/components/ui/Button";
import { deliveryCopy } from "@/content/presale";
import { formatMoney } from "@/lib/format";
import { ChoiceTile, FieldError, Optional, TextInput, describedBy, labelClass } from "./fields";
import type { AddressValues } from "./validation";

/** Recolección: el cliente elige el punto. */
export function PickupPoints({ points, value, onChange, errors }: { points: PickupPointInfo[]; value: string; onChange: (id: string) => void; errors?: string[] }) {
  return (
    <fieldset className="mt-6" aria-describedby={errors?.length ? "pickupPointId-error" : undefined}>
      <legend className={labelClass}>{deliveryCopy.pickup.pointsTitle}</legend>
      <div className="mt-3 grid gap-3">
        {points.map((point, index) => (
          <ChoiceTile
            key={point.id}
            id={index === 0 ? "pickupPointId" : undefined}
            type="radio"
            name="pickupPointId"
            align="start"
            checked={value === point.id}
            invalid={!!errors?.length}
            onChange={() => onChange(point.id)}
            description={point.schedule}
          >
            <span className="font-semibold">{point.name}</span>
          </ChoiceTile>
        ))}
      </div>
      <FieldError id="pickupPointId" errors={errors} />
      <p className="mt-3 text-sm text-muted">{deliveryCopy.pickup.notice}</p>
    </fieldset>
  );
}

type ShippingProps = {
  address: AddressValues;
  onAddress: (key: keyof AddressValues, value: string) => void;
  errors: Record<string, string[]>;
  quote: ShippingQuoteResponse | null;
  optionId: string | null;
  onOption: (id: string) => void;
  onQuote: () => void;
  quoting: boolean;
  quoteError: string | null;
};

const FIELDS: { key: keyof AddressValues; label: string; autoComplete: string; placeholder?: string; inputMode?: "numeric"; span?: boolean; optional?: boolean }[] = [
  { key: "postalCode", label: "Código postal", autoComplete: "postal-code", inputMode: "numeric", placeholder: "31000" },
  { key: "state", label: "Estado", autoComplete: "address-level1" },
  { key: "city", label: "Ciudad o municipio", autoComplete: "address-level2" },
  { key: "neighborhood", label: "Colonia", autoComplete: "address-level3" },
  { key: "street", label: "Calle y número (exterior e interior)", autoComplete: "street-address", span: true },
  { key: "reference", label: "Referencias para la entrega", autoComplete: "off", span: true, optional: true },
];

/** Envío: dirección completa, cotización con SkyDropX y elección de la opción. El total se conoce antes de pagar. */
export function ShippingDetails({ address, onAddress, errors, quote, optionId, onOption, onQuote, quoting, quoteError }: ShippingProps) {
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {FIELDS.map((field) => {
          const key = `address.${field.key}`;
          return (
            <div key={field.key} className={field.span ? "sm:col-span-2 lg:col-span-1 xl:col-span-2" : undefined}>
              <label htmlFor={key} className={labelClass}>
                {field.label}
                {field.optional && <Optional />}
              </label>
              <TextInput
                id={key}
                name={key}
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                maxLength={field.key === "postalCode" ? 5 : field.key === "reference" ? 200 : 120}
                placeholder={field.placeholder}
                value={address[field.key]}
                onChange={(e) => onAddress(field.key, field.key === "postalCode" ? e.target.value.replace(/\D/g, "") : e.target.value)}
                aria-invalid={!!errors[key]}
                aria-describedby={describedBy(key, { errors: errors[key] })}
              />
              <FieldError id={key} errors={errors[key]} />
            </div>
          );
        })}
      </div>

      <div id="shipping" className="scroll-mt-28 space-y-4" aria-live="polite">
        {!quote && (
          <Button type="button" variant="ghost" size="md" onClick={onQuote} loading={quoting} disabled={quoting}>
            {quoting ? deliveryCopy.shipping.quoting : deliveryCopy.shipping.quote}
          </Button>
        )}
        {quoteError && <p className="text-sm text-danger">{quoteError}</p>}
        <FieldError id="shipping" errors={errors.shipping} />

        {quote && (
          <fieldset>
            <legend className={labelClass}>{deliveryCopy.shipping.optionsTitle}</legend>
            <div className="mt-3 grid gap-3">
              {quote.options.map((option) => (
                <ChoiceTile
                  key={option.id}
                  type="radio"
                  name="shippingOption"
                  align="start"
                  checked={optionId === option.id}
                  onChange={() => onOption(option.id)}
                  description={`${option.carrier}${option.service ? ` · ${option.service}` : ""}${option.days ? ` · ${deliveryCopy.shipping.days(option.days)}` : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{option.id === "express" ? deliveryCopy.shipping.express : deliveryCopy.shipping.economy}</span>
                    <span className="font-semibold lining-nums tabular-nums">{formatMoney(option.amount, quote.currency)}</span>
                  </span>
                </ChoiceTile>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{deliveryCopy.shipping.quoteNote}</p>
          </fieldset>
        )}
      </div>
    </div>
  );
}
