"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, CreateReservationResponse, PublicCampaign } from "@/server/presale/contract";
import { formatMoney } from "@/lib/format";

type AnswerValue = string | string[] | boolean;
type FieldErrors = Record<string, string[]>;

const inputClass = "mt-2 w-full border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-fg";
const labelClass = "block text-sm font-medium";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
      {errors.join(" ")}
    </p>
  );
}

export function ReservationForm({ campaign }: { campaign: PublicCampaign }) {
  // Una clave por visita: un doble clic no crea dos pagos.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (id: string, value: AnswerValue) => setAnswers((current) => ({ ...current, [id]: value }));
  const describedBy = (id: string) => (errors[id] ? `${id}-error` : undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const params = new URLSearchParams(window.location.search);
    const attribution = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])),
    );
    if (document.referrer) attribution.referrer = document.referrer.slice(0, 200);

    try {
      const response = await fetch(`/api/preventa/${campaign.slug}/reservas`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          quantity,
          answers,
          acceptTerms: form.get("acceptTerms") === "on",
          marketingConsent: form.get("marketingConsent") === "on",
          website: form.get("website"),
          attribution,
        }),
      });
      const data = (await response.json()) as CreateReservationResponse | ApiError;
      if ("checkoutUrl" in data) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setErrors(data.error.fieldErrors ?? {});
      setFormError(data.error.message);
    } catch {
      setFormError("No pudimos enviar tu reserva. Revisa tu conexión e inténtalo de nuevo.");
    }
    setSubmitting(false);
  }

  const total = campaign.unitAmount * quantity;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="fullName" className={labelClass}>Nombre completo</label>
          <input id="fullName" name="fullName" autoComplete="name" required className={inputClass} aria-invalid={!!errors.fullName} aria-describedby={describedBy("fullName")} />
          <FieldError id="fullName" errors={errors.fullName} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} aria-invalid={!!errors.email} aria-describedby={describedBy("email")} />
          <FieldError id="email" errors={errors.email} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Teléfono <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} aria-invalid={!!errors.phone} aria-describedby={describedBy("phone")} />
          <FieldError id="phone" errors={errors.phone} />
        </div>
        {campaign.maxQuantityPerReservation > 1 && (
          <div>
            <label htmlFor="quantity" className={labelClass}>Cantidad</label>
            <select id="quantity" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={inputClass} aria-describedby={describedBy("quantity")}>
              {Array.from({ length: campaign.maxQuantityPerReservation }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <FieldError id="quantity" errors={errors.quantity} />
          </div>
        )}
      </div>

      {campaign.questions.length > 0 && (
        <fieldset className="space-y-6 border-t border-border pt-8">
          <legend className="sr-only">Cuestionario</legend>
          <p aria-hidden="true" className="text-xs tracking-[0.2em] text-muted uppercase">Cuestionario</p>
          {campaign.questions.map((question) => {
            const id = `answers.${question.id}`;
            const invalid = !!errors[id];
            const label = (
              <>
                {question.label}
                {!question.required && <span className="font-normal text-muted"> (opcional)</span>}
              </>
            );
            const help = question.helpText ? <p className="mt-1 text-sm text-muted">{question.helpText}</p> : null;

            if (question.type === "text" || question.type === "textarea") {
              const Tag = question.type === "text" ? "input" : "textarea";
              return (
                <div key={question.id}>
                  <label htmlFor={id} className={labelClass}>{label}</label>
                  {help}
                  <Tag
                    id={id}
                    maxLength={question.maxLength}
                    rows={question.type === "textarea" ? 4 : undefined}
                    className={inputClass}
                    aria-invalid={invalid}
                    aria-describedby={describedBy(id)}
                    onChange={(e) => setAnswer(question.id, e.target.value)}
                  />
                  <FieldError id={id} errors={errors[id]} />
                </div>
              );
            }

            if (question.type === "boolean") {
              return (
                <div key={question.id}>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-fg" aria-invalid={invalid} aria-describedby={describedBy(id)} onChange={(e) => setAnswer(question.id, e.target.checked)} />
                    <span>{label}</span>
                  </label>
                  {help}
                  <FieldError id={id} errors={errors[id]} />
                </div>
              );
            }

            const multiple = question.type === "multiselect";
            const selected = answers[question.id];
            return (
              <fieldset key={question.id} aria-describedby={describedBy(id)}>
                <legend className={labelClass}>{label}</legend>
                {help}
                <div className="mt-3 space-y-2">
                  {(question.options ?? []).map((option) => {
                    const checked = multiple ? Array.isArray(selected) && selected.includes(option.value) : selected === option.value;
                    return (
                      <label key={option.value} className="flex items-center gap-3 text-sm">
                        <input
                          type={multiple ? "checkbox" : "radio"}
                          name={id}
                          value={option.value}
                          checked={checked}
                          className="size-4 accent-fg"
                          onChange={(e) => {
                            if (!multiple) return setAnswer(question.id, option.value);
                            const current = Array.isArray(selected) ? selected : [];
                            setAnswer(question.id, e.target.checked ? [...current, option.value] : current.filter((v) => v !== option.value));
                          }}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                <FieldError id={id} errors={errors[id]} />
              </fieldset>
            );
          })}
        </fieldset>
      )}

      {/* Honeypot: oculto para personas, visible para bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">No llenar</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 accent-fg" aria-invalid={!!errors.acceptTerms} aria-describedby={describedBy("acceptTerms")} />
          {/* PLACEHOLDER: enlazar a los términos de la preventa cuando estén aprobados. */}
          <span>Acepto los términos de la preventa.</span>
        </label>
        <FieldError id="acceptTerms" errors={errors.acceptTerms} />
        <label className="flex items-start gap-3 text-sm text-muted">
          <input type="checkbox" name="marketingConsent" className="mt-0.5 size-4 accent-fg" />
          <span>Quiero recibir noticias de inttimo por correo.</span>
        </label>
      </div>

      {formError && (
        <p role="alert" className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-accent px-6 py-4 text-sm tracking-[0.18em] text-bg uppercase transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Preparando pago…" : `Reservar mi lugar · ${formatMoney(total, campaign.currency)}`}
      </button>
      <p className="text-xs text-muted">Serás redirigido a Stripe para pagar de forma segura.</p>
    </form>
  );
}
