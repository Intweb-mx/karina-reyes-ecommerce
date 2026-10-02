"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { ApiError, CreateReservationResponse, DeliveryMethod, PublicCampaign, ShippingQuoteResponse } from "@/server/presale/contract";
import { deliveryCopy, formCopy } from "@/content/presale";
import {
  emptyAddress,
  emptyValues,
  validateAddress,
  validateField,
  validateReservation,
  type AddressValues,
  type AnswerValue,
  type FieldErrors,
  type ReservationValues,
} from "./validation";

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
  // La entrega se elige antes de pagar. Con un solo método disponible, queda elegido.
  const onlyMethod = campaign.delivery.shipping.enabled !== campaign.delivery.pickup.enabled ? (campaign.delivery.shipping.enabled ? "shipping" : "pickup") : null;
  const [deliveryMethod, setDeliveryMethodState] = useState<DeliveryMethod | null>(onlyMethod);
  const [pickupPointId, setPickupPointIdState] = useState(campaign.delivery.pickup.points.length === 1 ? campaign.delivery.pickup.points[0]!.id : "");
  const [address, setAddress] = useState<AddressValues>(emptyAddress);
  const [quote, setQuote] = useState<ShippingQuoteResponse | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
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

    const local = { ...validateReservation(values, campaign.questions), ...validateDelivery() };
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
          ...(deliveryMethod === "pickup" ? { pickupPointId } : {}),
          ...(deliveryMethod === "shipping" && quote && optionId
            ? { shipping: { quoteId: quote.quoteId, optionId, address: { ...address, reference: address.reference || undefined } } }
            : {}),
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
        // Cotización vencida o inválida: hay que volver a calcular.
        if (data.error.fieldErrors?.shipping) resetQuote();
      }
    } catch {
      setFormError(formCopy.networkError);
    }
    setStatus("idle");
    focusSummary();
  }

  const clearErrors = (...keys: string[]) =>
    setErrors((current) => {
      if (!keys.some((key) => current[key])) return current;
      const rest = { ...current };
      for (const key of keys) delete rest[key];
      return rest;
    });

  function resetQuote() {
    setQuote(null);
    setOptionId(null);
  }

  /** Errores de entrega con las mismas claves que la API. */
  function validateDelivery(): FieldErrors {
    if (!deliveryMethod) return { deliveryMethod: [deliveryCopy.required] };
    if (deliveryMethod === "pickup") return pickupPointId ? {} : { pickupPointId: [deliveryCopy.pickup.pointRequired] };
    const errors = validateAddress(address);
    if (!values.phone.trim()) errors.phone = [deliveryCopy.shipping.phoneRequired];
    if (!quote || !optionId) errors.shipping = [deliveryCopy.shipping.quoteRequired];
    return errors;
  }

  const setDeliveryMethod = (method: DeliveryMethod) => {
    setDeliveryMethodState(method);
    clearErrors("deliveryMethod");
  };

  const setPickupPointId = (id: string) => {
    setPickupPointIdState(id);
    clearErrors("pickupPointId");
  };

  const setAddressField = (key: keyof AddressValues, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }));
    clearErrors(`address.${key}`);
    // La tarifa depende del destino: cambiar CP, estado, ciudad o colonia invalida la cotización.
    if (quote && key !== "street" && key !== "reference") {
      resetQuote();
      setQuoteError(deliveryCopy.shipping.requote);
    }
  };

  const changeQuantity = (next: number) => {
    setQuantity(next);
    if (quote) {
      resetQuote();
      setQuoteError(deliveryCopy.shipping.requote);
    }
  };

  async function requestQuote() {
    const addressErrors = validateAddress({ ...address, street: address.street || "-" });
    setQuoteError(null);
    if (Object.keys(addressErrors).length) {
      setErrors((current) => ({ ...current, ...addressErrors }));
      return;
    }
    setQuoting(true);
    try {
      const response = await fetch(`/api/preventa/${campaign.slug}/envio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postalCode: address.postalCode, state: address.state, city: address.city, neighborhood: address.neighborhood, quantity }),
      });
      const data = (await response.json()) as ShippingQuoteResponse | ApiError;
      if ("quoteId" in data) {
        setQuote(data);
        setOptionId(data.options[0]?.id ?? null);
        clearErrors("shipping");
      } else {
        setErrors((current) => ({ ...current, ...(data.error.fieldErrors ?? {}) }));
        setQuoteError(data.error.message);
      }
    } catch {
      setQuoteError(formCopy.networkError);
    }
    setQuoting(false);
  }

  const shippingAmount = deliveryMethod === "shipping" ? (quote?.options.find((o) => o.id === optionId)?.amount ?? null) : 0;

  return {
    values,
    quantity,
    setQuantity: changeQuantity,
    deliveryMethod,
    setDeliveryMethod,
    pickupPointId,
    setPickupPointId,
    address,
    setAddressField,
    quote,
    optionId,
    setOptionId: (id: string) => {
      setOptionId(id);
      clearErrors("shipping");
    },
    requestQuote,
    quoting,
    quoteError,
    shippingAmount,
    errors,
    formError,
    status,
    setField,
    setAnswer,
    blur,
    isValid,
    submit,
    summaryRef,
  };
}
