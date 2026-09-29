"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ApiError, CreateReservationResponse, PublicCampaign } from "@/server/presale/contract";
import { AlertIcon, ArrowRightIcon, LockIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";

type AnswerValue = string | string[] | boolean;
type FieldErrors = Record<string, string[]>;

const inputClass =
  "mt-2 block w-full border border-border bg-surface px-4 py-3 text-base text-fg outline-none transition-colors duration-(--duration-base) placeholder:text-muted/70 hover:border-fg/40 focus:border-fg focus-visible:outline-none aria-invalid:border-danger";
const labelClass = "block text-sm font-semibold";
const optionClass =
  "flex cursor-pointer items-start gap-3 border border-border bg-surface px-4 py-3.5 text-sm leading-snug transition-colors duration-(--duration-base) hover:border-fg/40 has-checked:border-fg has-checked:bg-bg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-fg";
const checkClass = "mt-0.5 size-4 shrink-0 accent-fg focus-visible:outline-none";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      {errors.join(" ")}
    </p>
  );
}

function Optional() {
  return <span className="font-normal text-muted"> (opcional)</span>;
}

function FormSection({ step, title, id, children }: { step: string; title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8">
      <h3 id={id} className="flex items-baseline gap-4">
        <span aria-hidden="true" className="font-serif text-2xl text-fg/40">
          {step}
        </span>
        <span className="font-serif text-3xl leading-tight font-medium">{title}</span>
      </h3>
      <div className="mt-8 space-y-7">{children}</div>
    </section>
  );
}

export function ReservationForm({ campaign }: { campaign: PublicCampaign }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  // Una clave por visita: un doble clic no crea dos pagos.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (id: string, value: AnswerValue) => setAnswers((current) => ({ ...current, [id]: value }));
  const describedBy = (id: string) => (errors[id] ? `${id}-error` : undefined);

  // Tras un error, lleva el foco al primer campo inválido (o al aviso general) para lectores de pantalla y teclado.
  function focusFirstProblem() {
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] input');
      if (target) {
        target.focus();
        target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      } else {
        alertRef.current?.focus();
      }
    });
  }

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
          termsVersion: campaign.terms?.version,
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
      // Términos nuevos: se recarga la campaña para mostrarlos (el formulario conserva lo escrito).
      if (data.error.code === "terms_outdated") router.refresh();
    } catch {
      setFormError("No pudimos enviar tu reserva. Revisa tu conexión e inténtalo de nuevo.");
    }
    setSubmitting(false);
    focusFirstProblem();
  }

  const total = campaign.unitAmount * quantity;
  const hasQuestions = campaign.questions.length > 0;
  const errorCount = Object.keys(errors).length;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
      <div className="space-y-14">
        <FormSection step="01" title="Tus datos" id="paso-datos">
          <div className="grid gap-7 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="fullName" className={labelClass}>Nombre completo</label>
              <input id="fullName" name="fullName" autoComplete="name" required className={inputClass} aria-invalid={!!errors.fullName} aria-describedby={describedBy("fullName")} />
              <FieldError id="fullName" errors={errors.fullName} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>Correo electrónico</label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                required
                className={inputClass}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : "email-help"}
              />
              <p id="email-help" className="mt-2 text-xs text-muted">Aquí recibirás tu folio.</p>
              <FieldError id="email" errors={errors.email} />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Teléfono<Optional />
              </label>
              <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} aria-invalid={!!errors.phone} aria-describedby={describedBy("phone")} />
              <FieldError id="phone" errors={errors.phone} />
            </div>
            {campaign.maxQuantityPerReservation > 1 && (
              <div>
                <label htmlFor="quantity" className={labelClass}>Cantidad</label>
                <select
                  id="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className={`${inputClass} appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10 bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%231b1a17' stroke-width='1.5'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E")]`}
                  aria-invalid={!!errors.quantity}
                  aria-describedby={describedBy("quantity")}
                >
                  {Array.from({ length: campaign.maxQuantityPerReservation }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <FieldError id="quantity" errors={errors.quantity} />
              </div>
            )}
          </div>
        </FormSection>

        {hasQuestions && (
          <FormSection step="02" title="Cuestionario" id="paso-cuestionario">
            {campaign.questions.map((question) => {
              const id = `answers.${question.id}`;
              const invalid = !!errors[id];
              const label = (
                <>
                  {question.label}
                  {!question.required && <Optional />}
                </>
              );
              const helpId = question.helpText ? `${id}-help` : undefined;
              const help = question.helpText ? <p id={helpId} className="mt-1.5 text-sm text-muted">{question.helpText}</p> : null;
              const describe = [helpId, describedBy(id)].filter(Boolean).join(" ") || undefined;

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
                      className={`${inputClass} ${question.type === "textarea" ? "min-h-28 resize-y" : ""}`}
                      aria-invalid={invalid}
                      aria-describedby={describe}
                      onChange={(e) => setAnswer(question.id, e.target.value)}
                    />
                    <FieldError id={id} errors={errors[id]} />
                  </div>
                );
              }

              if (question.type === "boolean") {
                return (
                  <div key={question.id}>
                    <label className={optionClass}>
                      <input type="checkbox" className={checkClass} aria-invalid={invalid} aria-describedby={describe} onChange={(e) => setAnswer(question.id, e.target.checked)} />
                      <span className="font-medium">{label}</span>
                    </label>
                    {help}
                    <FieldError id={id} errors={errors[id]} />
                  </div>
                );
              }

              const multiple = question.type === "multiselect";
              const selected = answers[question.id];
              return (
                <fieldset key={question.id} aria-describedby={describe} data-invalid={invalid}>
                  <legend className={labelClass}>{label}</legend>
                  {help}
                  <div className={`mt-3 grid gap-2.5 ${(question.options?.length ?? 0) > 2 ? "sm:grid-cols-2" : ""}`}>
                    {(question.options ?? []).map((option) => {
                      const checked = multiple ? Array.isArray(selected) && selected.includes(option.value) : selected === option.value;
                      return (
                        <label key={option.value} className={`${optionClass} ${invalid ? "border-danger/50" : ""}`}>
                          <input
                            type={multiple ? "checkbox" : "radio"}
                            name={id}
                            value={option.value}
                            checked={checked}
                            className={checkClass}
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
          </FormSection>
        )}

        {/* Honeypot: oculto para personas, visible para bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website">No llenar</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <FormSection step={hasQuestions ? "03" : "02"} title="Confirmación" id="paso-confirmacion">
          {campaign.terms && (
            <details className="group border border-border bg-surface text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                Términos de la preventa
                <span aria-hidden="true" className="text-lg leading-none font-normal text-muted transition-transform duration-(--duration-base) group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="max-h-80 overflow-y-auto border-t border-border px-5 py-4 leading-relaxed whitespace-pre-line text-muted">{campaign.terms.content}</div>
            </details>
          )}
          <div>
            <label className={`${optionClass} ${errors.acceptTerms ? "border-danger/50" : ""}`}>
              <input type="checkbox" name="acceptTerms" className={checkClass} aria-invalid={!!errors.acceptTerms} aria-describedby={describedBy("acceptTerms")} />
              <span>He leído y acepto los términos de la preventa.</span>
            </label>
            <FieldError id="acceptTerms" errors={errors.acceptTerms} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 px-1 text-sm text-muted">
            <input type="checkbox" name="marketingConsent" className={checkClass} />
            <span>
              Quiero recibir noticias de inttimo por correo.<Optional />
            </span>
          </label>
        </FormSection>
      </div>

      <aside aria-label="Resumen de tu reserva" className="lg:sticky lg:top-8 lg:self-start">
        <div className="border border-border bg-surface p-6 sm:p-8">
          <p className="eyebrow text-muted">Tu reserva</p>
          <p className="mt-3 font-serif text-3xl leading-tight font-medium">{campaign.productName}</p>
          <dl className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Precio de preventa</dt>
              <dd className="tabular-nums">{formatMoney(campaign.unitAmount, campaign.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Cantidad</dt>
              <dd className="tabular-nums">{quantity}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
              <dt className="font-semibold">Total</dt>
              <dd className="font-serif text-3xl font-medium lining-nums tabular-nums" aria-live="polite">
                {formatMoney(total, campaign.currency)}
              </dd>
            </div>
          </dl>

          <div ref={alertRef} tabIndex={-1} className="outline-none">
            {formError && (
              <div role="alert" className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertIcon className="mt-0.5 size-4 shrink-0" />
                  {formError}
                </p>
                {errorCount > 0 && <p className="mt-1 pl-6">{errorCount === 1 ? "Revisa el campo marcado." : `Revisa los ${errorCount} campos marcados.`}</p>}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="group mt-6 flex w-full items-center justify-center gap-3 bg-accent px-6 py-4 text-sm font-semibold tracking-[0.16em] text-bg uppercase transition-colors duration-(--duration-base) hover:bg-ink/85 disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? (
              <>
                <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                Preparando pago…
              </>
            ) : (
              <>
                Reservar y pagar
                <ArrowRightIcon className="size-4 transition-transform duration-(--duration-base) group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <LockIcon className="mt-px size-3.5 shrink-0" />
            Te llevaremos a Stripe para pagar de forma segura. No guardamos datos de tu tarjeta.
          </p>
        </div>
      </aside>
    </form>
  );
}
