"use client";

import type { ChurchQuoteRequest } from "@/lib/store/contract";
import { Button } from "@/components/ui/Button";
import { ChoiceTile, FieldError } from "@/components/presale/form/fields";
import { legalPaths } from "@/content/legal";
import { getStoreApi } from "@/lib/store/api";
import type { AckResponse } from "@/lib/store/contract";
import { Field, Honeypot, SentMessage } from "./Field";
import { EMAIL, text, useStoreForm } from "./useStoreForm";

const USES: { value: ChurchQuoteRequest["intendedUse"]; label: string }[] = [
  { value: "grupos", label: "Grupos de parejas" },
  { value: "retiro", label: "Retiro matrimonial" },
  { value: "consejeria", label: "Consejería" },
  { value: "evento", label: "Evento o conferencia" },
  { value: "otro", label: "Otro" },
];

/** Solicitud de cotización B2B (brief §24). Sin precios publicados: el equipo responde con una propuesta. */
export function ChurchQuoteForm() {
  const { ref, status, errors, formError, result, submit } = useStoreForm<AckResponse>((data) => {
    const errors: Record<string, string[]> = {};
    if (text(data, "organization").length < 2) errors.organization = ["Escribe el nombre de la iglesia o ministerio."];
    if (text(data, "contactName").length < 2) errors.contactName = ["Escribe tu nombre."];
    if (!EMAIL.test(text(data, "email"))) errors.email = ["Correo no válido."];
    if (text(data, "city").length < 2) errors.city = ["Escribe la ciudad."];
    const quantity = Number(text(data, "approximateQuantity"));
    if (!Number.isInteger(quantity) || quantity < 1) errors.approximateQuantity = ["Indica un número aproximado de juegos."];
    if (!data.get("intendedUse")) errors.intendedUse = ["Elige para qué lo usarán."];
    if (text(data, "message").length < 10) errors.message = ["Cuéntanos un poco más (mínimo 10 caracteres)."];
    if (data.get("consent") !== "on") errors.consent = ["Necesitamos tu autorización para contactarte."];
    return errors;
  });

  if (status === "sent") {
    return <SentMessage title="¡Gracias! Recibimos tu solicitud." body="Te contactaremos en un plazo de hasta 24 horas hábiles con una propuesta para tu iglesia o ministerio." reference={result?.reference} />;
  }

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit((data) =>
          getStoreApi().churchQuote({
            organization: text(data, "organization"),
            contactName: text(data, "contactName"),
            email: text(data, "email"),
            phone: text(data, "phone") || undefined,
            city: text(data, "city"),
            approximateQuantity: Number(text(data, "approximateQuantity")),
            eventDate: text(data, "eventDate") || undefined,
            intendedUse: String(data.get("intendedUse")) as ChurchQuoteRequest["intendedUse"],
            message: text(data, "message"),
            consent: true,
            website: text(data, "website"),
          }),
        );
      }}
      className="grid gap-6 sm:grid-cols-2"
    >
      <Field name="organization" label="Iglesia, ministerio u organización" autoComplete="organization" errors={errors.organization} className="sm:col-span-2" />
      <Field name="contactName" label="Tu nombre" autoComplete="name" errors={errors.contactName} />
      <Field name="email" label="Correo electrónico" type="email" autoComplete="email" errors={errors.email} />
      <Field name="phone" label="Teléfono" type="tel" autoComplete="tel" optional errors={errors.phone} />
      <Field name="city" label="Ciudad" autoComplete="address-level2" errors={errors.city} />
      <Field name="approximateQuantity" label="Juegos aproximados" type="number" inputMode="numeric" min={1} errors={errors.approximateQuantity} />
      <Field name="eventDate" label="Fecha del evento" type="date" optional errors={errors.eventDate} />
      <fieldset className="sm:col-span-2" aria-describedby={errors.intendedUse ? "intendedUse-error" : undefined}>
        <legend className="block text-[0.9375rem] font-semibold">¿Para qué lo usarán?</legend>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {USES.map((use, index) => (
            <ChoiceTile key={use.value} type="radio" name="intendedUse" value={use.value} marker={String.fromCharCode(65 + index)} invalid={!!errors.intendedUse}>
              {use.label}
            </ChoiceTile>
          ))}
        </div>
        <FieldError id="intendedUse" errors={errors.intendedUse} />
      </fieldset>
      <Field as="textarea" name="message" label="Cuéntanos sobre tu comunidad" errors={errors.message} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <ChoiceTile type="checkbox" name="consent" align="start" invalid={!!errors.consent}>
          <span className="text-sm">
            Autorizo a inttimo a contactarme sobre esta solicitud conforme al{" "}
            <a href={legalPaths.privacy} target="_blank" rel="noopener" className="underline underline-offset-4">Aviso de Privacidad</a>.
          </span>
        </ChoiceTile>
        <FieldError id="consent" errors={errors.consent} />
      </div>
      <Honeypot />
      {formError && <p role="alert" className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger sm:col-span-2">{formError}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" variant="bronze" arrow="right" loading={status === "sending"} disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Solicitar cotización"}
        </Button>
      </div>
    </form>
  );
}
