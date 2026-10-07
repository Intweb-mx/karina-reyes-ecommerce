"use client";

import { useState } from "react";
import type { ContactRequest } from "@/lib/store/contract";
import { Button } from "@/components/ui/Button";
import { getStoreApi } from "@/lib/store/api";
import type { AckResponse } from "@/lib/store/contract";
import { Field, Honeypot, SentMessage } from "./Field";
import { EMAIL, text, useStoreForm } from "./useStoreForm";

const TOPICS: { value: ContactRequest["topic"]; label: string }[] = [
  { value: "pedido", label: "Mi pedido" },
  { value: "producto", label: "Dudas sobre un producto" },
  { value: "iglesias", label: "Iglesias y ministerios" },
  { value: "facturacion", label: "Facturación" },
  { value: "otro", label: "Otro tema" },
];

/** Formulario de contacto con categorías y antispam (brief §13). Con "Mi pedido" pide el número de pedido. */
export function ContactForm() {
  const [topic, setTopic] = useState<ContactRequest["topic"]>("pedido");
  const { ref, status, errors, formError, result, submit } = useStoreForm<AckResponse>((data) => {
    const errors: Record<string, string[]> = {};
    if (text(data, "fullName").length < 2) errors.fullName = ["Escribe tu nombre."];
    if (!EMAIL.test(text(data, "email"))) errors.email = ["Correo no válido."];
    if (text(data, "message").length < 10) errors.message = ["Cuéntanos un poco más (mínimo 10 caracteres)."];
    return errors;
  });

  if (status === "sent") {
    return <SentMessage title="¡Mensaje enviado!" body="Te responderemos en un plazo de hasta 24 horas hábiles, de lunes a viernes de 9:00 a 17:00 horas." reference={result?.reference} />;
  }

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit((data) =>
          getStoreApi().contact({
            fullName: text(data, "fullName"),
            email: text(data, "email"),
            phone: text(data, "phone") || undefined,
            topic,
            orderNumber: text(data, "orderNumber") || undefined,
            message: text(data, "message"),
            website: text(data, "website"),
          }),
        );
      }}
      className="grid gap-6 sm:grid-cols-2"
    >
      <Field name="fullName" label="Nombre completo" autoComplete="name" errors={errors.fullName} className="sm:col-span-2" />
      <Field name="email" label="Correo electrónico" type="email" autoComplete="email" errors={errors.email} />
      <Field name="phone" label="Teléfono" type="tel" autoComplete="tel" optional errors={errors.phone} />
      <Field as="select" name="topic" label="Asunto" value={topic} onChange={(e: { target: { value: string } }) => setTopic(e.target.value as ContactRequest["topic"])} options={TOPICS} />
      {topic === "pedido" && <Field name="orderNumber" label="Número de pedido" optional hint="Lo encuentras en tu correo de confirmación." errors={errors.orderNumber} />}
      <Field as="textarea" name="message" label="Mensaje" errors={errors.message} className="sm:col-span-2" />
      <Honeypot />
      {formError && <p role="alert" className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger sm:col-span-2">{formError}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" arrow="right" loading={status === "sending"} disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar mensaje"}
        </Button>
      </div>
    </form>
  );
}
