"use client";

import type { FormEvent } from "react";
import type { PublicCampaign } from "@/server/presale/contract";
import { formCopy } from "@/content/presale";
import { formatMoney } from "@/lib/format";
import { ErrorSummary } from "./ErrorSummary";
import { ChoiceTile, FieldError, FormSection, Hint, Optional, TextInput, describedBy, labelClass } from "./fields";
import { MobileCheckoutBar } from "./MobileCheckoutBar";
import { OrderSummary } from "./OrderSummary";
import { QuantityStepper } from "./QuantityStepper";
import { QuestionField } from "./QuestionField";
import { useReservationForm } from "./useReservationForm";
import { answerKey, progress } from "./validation";

export function ReservationForm({ campaign }: { campaign: PublicCampaign }) {
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
    ...(hasQuestions
      ? [{ id: "paso-cuestionario", label: formCopy.sections.questions, done: done.questions.done, detail: done.questions.total ? `${done.questions.answered}/${done.questions.total}` : undefined }]
      : []),
    { id: "paso-confirmacion", label: formCopy.sections.confirm, done: done.confirm },
  ];
  const completed = steps.filter((step) => step.done).length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "idle") return;
    submit(String(new FormData(event.currentTarget).get("website") ?? ""));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16">
      <div className="space-y-14">
        <ErrorSummary ref={summaryRef} errors={errors} labels={labels} message={formError} />

        <FormSection step="01" title={formCopy.sections.contact} id="paso-datos" complete={done.contact}>
          <div className="grid gap-7 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="fullName" className={labelClass}>Nombre completo</label>
              <TextInput
                id="fullName"
                name="fullName"
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
              <Hint id="email">Aquí recibirás tu folio.</Hint>
              <FieldError id="email" errors={errors.email} />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Teléfono<Optional />
              </label>
              <TextInput
                id="phone"
                name="phone"
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
            {campaign.maxQuantityPerReservation > 1 && (
              <QuantityStepper value={quantity} max={campaign.maxQuantityPerReservation} onChange={setQuantity} errors={errors.quantity} />
            )}
          </div>
        </FormSection>

        {hasQuestions && (
          <FormSection step="02" title={formCopy.sections.questions} id="paso-cuestionario" complete={done.questions.done}>
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

        <FormSection step={hasQuestions ? "03" : "02"} title={formCopy.sections.confirm} id="paso-confirmacion" complete={done.confirm}>
          {campaign.terms && (
            <details className="group border border-border bg-surface text-sm transition-colors open:bg-bg">
              <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 font-semibold transition-colors hover:bg-sand/40 [&::-webkit-details-marker]:hidden">
                <span>
                  Leer los términos de la preventa <span className="font-normal text-muted">· versión {campaign.terms.version}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-base leading-none font-normal text-muted transition-transform duration-(--duration-base) ease-soft group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="max-h-80 overflow-y-auto border-t border-border px-5 py-5 leading-relaxed whitespace-pre-line text-fg/80">{campaign.terms.content}</div>
            </details>
          )}
          <div>
            <ChoiceTile
              id="acceptTerms"
              type="checkbox"
              checked={values.acceptTerms}
              invalid={!!errors.acceptTerms}
              aria-describedby={describedBy("acceptTerms", { errors: errors.acceptTerms })}
              onChange={(e) => setField("acceptTerms", e.target.checked, true)}
            >
              <span className="font-medium">He leído y acepto los términos de la preventa.</span>
            </ChoiceTile>
            <FieldError id="acceptTerms" errors={errors.acceptTerms} />
          </div>
          <label className="flex cursor-pointer items-start gap-3.5 px-4 text-sm text-muted">
            <input type="checkbox" className="choice" checked={values.marketingConsent} onChange={(e) => setField("marketingConsent", e.target.checked)} />
            <span className="pt-px">
              Quiero recibir noticias de inttimo por correo.<Optional />
            </span>
          </label>
        </FormSection>
      </div>

      <OrderSummary
        productName={campaign.productName}
        unitAmount={campaign.unitAmount}
        currency={campaign.currency}
        quantity={quantity}
        steps={steps}
        completed={completed}
        status={status}
      />
      <MobileCheckoutBar total={total} status={status} completed={completed} steps={steps.length} />
    </form>
  );
}
