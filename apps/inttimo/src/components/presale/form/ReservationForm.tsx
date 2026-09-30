"use client";

import type { FormEvent } from "react";
import type { PublicCampaign } from "@/server/presale/contract";
import type { ProductContent } from "@/content/products";
import { formCopy } from "@/content/presale";
import { ChevronDownIcon, MailIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import { CheckoutSteps } from "./CheckoutSteps";
import { ErrorSummary } from "./ErrorSummary";
import { ChoiceTile, FieldError, FormSection, Hint, Optional, TextInput, describedBy, labelClass } from "./fields";
import { MobileCheckoutBar } from "./MobileCheckoutBar";
import { PayBlock, PurchaseSummary } from "./OrderSummary";
import { QuestionField } from "./QuestionField";
import { useReservationForm } from "./useReservationForm";
import { answerKey, progress } from "./validation";

/**
 * Checkout de la preventa: pasos arriba, datos y preguntas en tarjetas a la izquierda y, a la derecha (fijo en escritorio),
 * "Confirma tu compra": tabla de la compra con cantidad editable, términos y botón de pago.
 * La lógica de envío (validación, Idempotency-Key, honeypot, errores de la API) vive en useReservationForm.
 */
export function ReservationForm({ campaign, product }: { campaign: PublicCampaign; product: ProductContent | null }) {
  const { values, errors, quantity, setQuantity, formError, status, setField, setAnswer, blur, isValid, submit, summaryRef } = useReservationForm(campaign);
  const hasQuestions = campaign.questions.length > 0;
  const done = progress(values, campaign.questions);
  const total = formatMoney(campaign.unitAmount * quantity, campaign.currency);

  const labels: Record<string, string> = {
    fullName: "Nombre completo",
    email: "Correo electrónico",
    phone: "Teléfono",
    quantity: "Cantidad",
    acceptTerms: "Términos",
    ...Object.fromEntries(campaign.questions.map((q) => [answerKey(q.id), q.label])),
  };

  const steps = [
    { id: "paso-datos", label: formCopy.sections.contact, done: done.contact },
    ...(hasQuestions ? [{ id: "paso-cuestionario", label: formCopy.sections.questions, done: done.questions.done }] : []),
    { id: "paso-confirmacion", label: formCopy.sections.confirm, done: done.confirm },
  ];
  const completed = steps.filter((step) => step.done).length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;
    submit(String(new FormData(event.currentTarget).get("website") ?? ""));
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mx-auto max-w-2xl">
        <CheckoutSteps steps={steps} />
      </div>

      <div className="mt-8 grid gap-6 sm:mt-10 sm:gap-8 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-12">
        {/* Datos */}
        <div className="space-y-8">
          <ErrorSummary ref={summaryRef} errors={errors} labels={labels} message={formError} />

          <FormSection step="1" title={formCopy.sections.contact} description="Para enviarte la confirmación de tu compra." id="paso-datos" complete={done.contact}>
            <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <label htmlFor="fullName" className={labelClass}>Nombre completo</label>
                <TextInput
                  id="fullName"
                  name="fullName"
                  icon={<UserIcon className="size-5" />}
                  placeholder="Nombre y apellidos"
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  required
                  value={values.fullName}
                  valid={isValid("fullName")}
                  onChange={(e) => setField("fullName", e.target.value)}
                  onBlur={() => blur("fullName")}
                  aria-invalid={!!errors.fullName}
                  aria-describedby={describedBy("fullName", { errors: errors.fullName })}
                />
                <FieldError id="fullName" errors={errors.fullName} />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>Correo electrónico</label>
                <TextInput
                  id="email"
                  name="email"
                  icon={<MailIcon className="size-5" />}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  enterKeyHint="next"
                  spellCheck={false}
                  placeholder="nombre@correo.com"
                  required
                  value={values.email}
                  valid={isValid("email")}
                  onChange={(e) => setField("email", e.target.value)}
                  onBlur={() => blur("email")}
                  aria-invalid={!!errors.email}
                  aria-describedby={describedBy("email", { hint: true, errors: errors.email })}
                />
                <Hint id="email">Aquí recibirás la confirmación de tu compra.</Hint>
                <FieldError id="email" errors={errors.email} />
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>
                  Teléfono<Optional />
                </label>
                <TextInput
                  id="phone"
                  name="phone"
                  icon={<PhoneIcon className="size-5" />}
                  placeholder="+52 55 1234 5678"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  value={values.phone}
                  valid={isValid("phone") && values.phone.trim().length > 0}
                  onChange={(e) => setField("phone", e.target.value)}
                  onBlur={() => blur("phone")}
                  aria-invalid={!!errors.phone}
                  aria-describedby={describedBy("phone", { errors: errors.phone })}
                />
                <FieldError id="phone" errors={errors.phone} />
              </div>
            </div>
          </FormSection>

          {hasQuestions && (
            <FormSection step="2" title={formCopy.sections.questions} description={formCopy.questionsIntro} id="paso-cuestionario" complete={done.questions.done}>
              {campaign.questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={values.answers[question.id]}
                  errors={errors[answerKey(question.id)]}
                  valid={isValid(answerKey(question.id))}
                  onChange={(value, touch) => setAnswer(question.id, value, touch)}
                  onBlur={() => blur(answerKey(question.id))}
                />
              ))}
            </FormSection>
          )}

          {/* Honeypot: oculto para personas, visible para bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">No llenar</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
        </div>

        {/* Confirmación y pago */}
        <aside
          id="paso-confirmacion"
          aria-labelledby="paso-confirmacion-title"
          className="scroll-mt-24 self-start border border-border bg-[#fffdf9] shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] max-sm:-mx-4 max-sm:border-x-0 lg:sticky lg:top-24"
        >
          <header className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-7">
            <span
              aria-hidden="true"
              className={`grid size-8 shrink-0 place-items-center rounded-full border font-serif lining-nums transition-colors ${done.confirm ? "border-success bg-success text-on-ink" : "border-border text-fg/60"}`}
            >
              {steps.length}
            </span>
            <h3 id="paso-confirmacion-title" className="font-serif text-2xl leading-tight font-medium">
              {formCopy.sections.confirm}
            </h3>
          </header>

          <div className="space-y-6 px-5 py-6 sm:px-7">
            <PurchaseSummary
              productName={campaign.productName}
              product={product}
              unitAmount={campaign.unitAmount}
              currency={campaign.currency}
              quantity={quantity}
              maxQuantity={campaign.maxQuantityPerReservation}
              onQuantity={setQuantity}
              quantityErrors={errors.quantity}
            />

            {campaign.terms && (
              <details className="group border border-border text-sm">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-sand/40 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block font-semibold">Términos y condiciones</span>
                    <span className="block text-xs text-muted">Versión {campaign.terms.version} · Toca para leer</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-muted transition-[transform,background-color,color] duration-(--duration-base) group-open:rotate-180 group-open:border-ink group-open:bg-ink group-open:text-on-ink"
                  >
                    <ChevronDownIcon className="size-3.5" />
                  </span>
                </summary>
                <div className="max-h-64 overflow-y-auto border-t border-border px-4 py-4 leading-relaxed whitespace-pre-line text-fg/80">{campaign.terms.content}</div>
              </details>
            )}

            <div className="space-y-3">
              <div>
                <ChoiceTile
                  id="acceptTerms"
                  type="checkbox"
                  checked={values.acceptTerms}
                  invalid={!!errors.acceptTerms}
                  aria-describedby={describedBy("acceptTerms", { errors: errors.acceptTerms })}
                  onChange={(e) => setField("acceptTerms", e.target.checked, true)}
                >
                  <span className="text-sm font-medium">{formCopy.acceptTerms}</span>
                </ChoiceTile>
                <FieldError id="acceptTerms" errors={errors.acceptTerms} />
              </div>
              <label className="flex cursor-pointer items-start gap-3.5 px-4 text-xs text-muted transition-colors hover:text-fg">
                <input type="checkbox" className="choice" checked={values.marketingConsent} onChange={(e) => setField("marketingConsent", e.target.checked)} />
                <span className="pt-0.5">
                  Quiero recibir noticias de inttimo por correo.<Optional />
                </span>
              </label>
            </div>

            <PayBlock productName={campaign.productName} status={status} />
          </div>
        </aside>
      </div>

      <MobileCheckoutBar total={total} status={status} completed={completed} steps={steps.length} />
    </form>
  );
}
