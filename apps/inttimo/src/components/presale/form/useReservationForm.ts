"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { ApiError, CreateReservationResponse, DeliveryMethod, PublicCampaign } from "@/server/presale/contract";
import { formCopy } from "@/content/presale";
import { emptyValues, validateField, validateReservation, type AnswerValue, type FieldErrors, type ReservationValues } from "./validation";

type Status = "idle" | "submitting" | "redirecting";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function readAttribution(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const attribution = Object.fromEntries(UTM_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));
  if (document.referrer) attribution.referrer = document.referrer.slice(0, 200);
  return attribution;
}

/**
 * Estado y envío del formulario de reserva. Valida en el navegador para dar respuesta inmediata,
 * pero el servidor decide: sus `fieldErrors` reemplazan a los locales.
 */
export function useReservationForm(campaign: PublicCampaign) {
  const router = useRouter();
  // Una clave por visita: un doble clic no crea dos pagos.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<ReservationValues>(emptyValues);
  const [quantity, setQuantity] = useState(1);
  // Mismo criterio que la API: envío si está habilitado; si no, recolección.
  const [deliveryMethod, setDeliveryMethodState] = useState<DeliveryMethod>(campaign.delivery.shipping.enabled ? "shipping" : "pickup");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [submitCount, setSubmitCount] = useState(0);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const summaryRef = useRef<HTMLDivElement>(null);

  const markTouched = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));

  const revalidate = useCallback(
    (key: string, next: ReservationValues, visited: boolean) => {
      // Solo corrige en vivo campos ya visitados o tras un intento de envío: no regaña mientras se escribe por primera vez.
      if (!visited && submitCount === 0) return;
      const messages = validateField(key, next, campaign.questions);
      setErrors((current) => {
        const rest = { ...current };
        delete rest[key];
        return messages.length ? { ...rest, [key]: messages } : rest;
      });
    },
    [campaign.questions, submitCount],
  );

  const setField = <K extends Exclude<keyof ReservationValues, "answers">>(key: K, value: ReservationValues[K], touch = false) => {
    if (touch) markTouched(key);
    const next = { ...values, [key]: value };
    setValues(next);
    revalidate(key, next, touch || touched.has(key));
  };

  const setAnswer = (questionId: string, value: AnswerValue, touch = false) => {
    // Opciones y casillas se validan al elegir; los textos, al salir del campo.
    const key = `answers.${questionId}`;
    if (touch) markTouched(key);
    const next = { ...values, answers: { ...values.answers, [questionId]: value } };
    setValues(next);
    revalidate(key, next, touch || touched.has(key));
  };

  const blur = (key: string) => {
    markTouched(key);
    revalidate(key, values, true);
  };

  /** Campo visitado, con valor y sin errores: se muestra una marca discreta de "correcto". */
  const isValid = (key: string) => touched.has(key) && !errors[key] && validateField(key, values, campaign.questions).length === 0;

  function focusSummary() {
    requestAnimationFrame(() => {
      summaryRef.current?.focus();
      summaryRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }

  async function submit(website: string) {
    setSubmitCount((n) => n + 1);
    setFormError(null);

    const local = validateReservation(values, campaign.questions);
    if (Object.keys(local).length) {
      setErrors(local);
      focusSummary();
      return;
    }

    setErrors({});
    setStatus("submitting");
    try {
      const response = await fetch(`/api/preventa/${campaign.slug}/reservas`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          fullName: values.fullName,
          email: values.email,
          phone: values.phone || undefined,
          quantity,
          deliveryMethod,
          answers: values.answers,
          acceptTerms: values.acceptTerms,
          termsVersion: campaign.terms?.version,
          marketingConsent: values.marketingConsent,
          website,
          attribution: readAttribution(),
        }),
      });
      const data = (await response.json()) as CreateReservationResponse | ApiError;
      if ("checkoutUrl" in data) {
        setStatus("redirecting");
        window.location.assign(data.checkoutUrl);
        return;
      }
      setErrors(data.error.fieldErrors ?? {});
      if (data.error.code === "terms_outdated") {
        // Términos nuevos: se recarga la campaña para mostrarlos y se pide aceptarlos otra vez (lo demás se conserva).
        setValues((current) => ({ ...current, acceptTerms: false }));
        setFormError(formCopy.termsUpdated);
        router.refresh();
      } else {
        setFormError(data.error.message);
        // Inventario agotado entre tanto: se recarga la campaña para mostrar el estado real.
        if (data.error.code === "sold_out") router.refresh();
      }
    } catch {
      setFormError(formCopy.networkError);
    }
    setStatus("idle");
    focusSummary();
  }

  const setDeliveryMethod = (method: DeliveryMethod) => {
    setDeliveryMethodState(method);
    setErrors((current) => {
      if (!current.deliveryMethod) return current;
      const rest = { ...current };
      delete rest.deliveryMethod;
      return rest;
    });
  };

  return { values, quantity, setQuantity, deliveryMethod, setDeliveryMethod, errors, formError, status, setField, setAnswer, blur, isValid, submit, summaryRef };
}
