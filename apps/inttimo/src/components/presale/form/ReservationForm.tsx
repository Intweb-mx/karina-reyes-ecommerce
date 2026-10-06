"use client";

import { useEffect, type FormEvent } from "react";
import type { PublicCampaign } from "@/server/presale/contract";
import type { ProductContent } from "@/content/products";
import Link from "next/link";
import { deliveryCopy, formCopy, legalNotice } from "@/content/presale";
import { acceptanceText, legalPaths } from "@/content/legal";
import { MailIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import { CheckoutSteps } from "./CheckoutSteps";
import { PickupPoints, ShippingDetails } from "./DeliveryDetails";
import { DeliverySelector } from "./DeliverySelector";
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
  const form = useReservationForm(campaign);
  const { values, errors, quantity, setQuantity, deliveryMethod, setDeliveryMethod, shippingAmount, formError, status, setField, setAnswer, blur, isValid, submit, summaryRef } = form;
  const hasQuestions = campaign.questions.length > 0;
  const done = progress(values, campaign.questions);
  const shippingCharge = shippingAmount ?? 0;
  const total = formatMoney(campaign.unitAmount * quantity + shippingCharge, campaign.currency);

  const labels: Record<string, string> = {
    fullName: "Nombre completo",
    email: "Correo electrónico",
    phone: "Teléfono",
    quantity: "Cantidad",
    acceptTerms: "Aceptación",
    deliveryMethod: "Entrega",
    pickupPointId: "Punto de recolección",
    shipping: "Envío",
    "address.postalCode": "Código postal",
    "address.state": "Estado",
    "address.city": "Ciudad o municipio",
    "address.neighborhood": "Colonia",
    "address.street": "Calle y número",
    ...Object.fromEntries(campaign.questions.map((q) => [answerKey(q.id), q.label])),
  };

  // La entrega cuenta como lista solo con el método elegido y su dato: punto de recolección o envío cotizado.
  const deliveryDone =
    deliveryMethod === "pickup" ? !!form.pickupPointId : deliveryMethod === "shipping" ? !!form.quote && !!form.optionId : false;

  const steps = [
    { id: "paso-datos", label: formCopy.sections.contact, done: done.contact },
    ...(hasQuestions ? [{ id: "paso-cuestionario", label: formCopy.sections.questions, done: done.questions.done }] : []),
    { id: "paso-entrega", label: deliveryCopy.sectionTitle, done: deliveryDone },
    { id: "paso-confirmacion", label: formCopy.sections.confirm, done: done.confirm },
  ];
  const completed = steps.filter((step) => step.done).length;

  // Al llegar con "Quiero mi UNO+UNO" (#reserva), en escritorio el cursor queda listo en el primer campo.
  // En táctil no: abrir el teclado sin pedirlo estorba.
  useEffect(() => {
    const focusFirst = () => {
      if (window.location.hash !== "#reserva" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      window.setTimeout(() => document.getElementById("fullName")?.focus({ preventScroll: true }), 700);
    };
    focusFirst();
    window.addEventListener("hashchange", focusFirst);
    return () => window.removeEventListener("hashchange", focusFirst);
  }, []);

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
                  Teléfono{deliveryMethod === "shipping" ? <span className="ml-1 text-xs font-normal text-muted">(obligatorio para envío)</span> : <Optional />}
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
                  required={deliveryMethod === "shipping"}
                  aria-describedby={describedBy("phone", { errors: errors.phone })}
                />
                <FieldError id="phone" errors={errors.phone} />
              </div>
            </div>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              {legalNotice.dataUse}{" "}
              <Link href={legalPaths.privacy} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-fg">
                Aviso de Privacidad
              </Link>
              .
            </p>
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

          <FormSection step={hasQuestions ? "3" : "2"} title={deliveryCopy.sectionTitle} description={deliveryCopy.sectionIntro} id="paso-entrega" complete={deliveryDone}>
            <DeliverySelector
              delivery={campaign.delivery}
              currency={campaign.currency}
              value={deliveryMethod}
              onChange={setDeliveryMethod}
              errors={errors.deliveryMethod}
              shippingAmount={deliveryMethod === "shipping" ? shippingAmount : null}
            />
            {deliveryMethod === "pickup" && (
              <PickupPoints points={campaign.delivery.pickup.points} value={form.pickupPointId} onChange={form.setPickupPointId} errors={errors.pickupPointId} />
            )}
            {deliveryMethod === "shipping" && (
              <ShippingDetails
                address={form.address}
                onAddress={form.setAddressField}
                errors={errors}
                quote={form.quote}
                optionId={form.optionId}
                onOption={form.setOptionId}
                onQuote={form.requestQuote}
                quoting={form.quoting}
                quoteError={form.quoteError}
              />
            )}
          </FormSection>

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
              startsAt={campaign.startsAt}
              endsAt={campaign.endsAt}
              totalUnits={campaign.totalUnits}
              deliveryMethod={deliveryMethod}
              shippingAmount={shippingAmount}
            />

            <div className="space-y-3">
              <div>
                <ChoiceTile
                  align="start"
                  id="acceptTerms"
                  type="checkbox"
                  checked={values.acceptTerms}
                  invalid={!!errors.acceptTerms}
                  aria-describedby={describedBy("acceptTerms", { errors: errors.acceptTerms })}
                  onChange={(e) => setField("acceptTerms", e.target.checked, true)}
                >
                  <span className="text-[0.8125rem] leading-relaxed text-fg/90 sm:text-sm">
                    {acceptanceText.beforeTerms}
                    <LegalLink href={legalPaths.terms}>{acceptanceText.terms}</LegalLink>
                    {acceptanceText.between}
                    <LegalLink href={legalPaths.privacy}>{acceptanceText.privacy}</LegalLink>
                    {acceptanceText.after}
                  </span>
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

            <ul className="space-y-1.5 text-center text-xs leading-relaxed text-muted">
              <li>
                <Link href={legalPaths.shipping} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-fg">
                  {legalNotice.shippingLink}
                </Link>
              </li>
              <li>{legalNotice.invoice}</li>
            </ul>
          </div>
        </aside>
      </div>

      <MobileCheckoutBar total={total} status={status} completed={completed} steps={steps.length} />
    </form>
  );
}

/** Enlace a un documento legal: se abre en otra pestaña para no perder lo capturado en el formulario. */
function LegalLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-bronze-strong">
      {children}
    </Link>
  );
}
