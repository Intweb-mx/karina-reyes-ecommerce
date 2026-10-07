"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Address, DeliveryOptionsResponse, ShippingQuoteResponse } from "@/lib/store/contract";
import { Button, ButtonLink } from "@/components/ui/Button";
import { LockIcon, MapPinIcon, TruckIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { ChoiceTile, FieldError, FormSection } from "@/components/presale/form/fields";
import { legalPaths } from "@/content/legal";
import { getStoreApi } from "@/lib/store/api";
import { formatMoney } from "@/lib/format";
import { useCart } from "../cart/CartProvider";
import { useCartQuote } from "../cart/useCartQuote";
import { Field, Honeypot } from "../forms/Field";
import { EMAIL } from "../forms/useStoreForm";

type Errors = Record<string, string[]>;
const ADDRESS_FIELDS: { key: keyof Address; label: string; autoComplete: string; span?: boolean; optional?: boolean; inputMode?: "numeric" }[] = [
  { key: "name", label: "Nombre de quien recibe", autoComplete: "name", span: true },
  { key: "phone", label: "Teléfono de quien recibe", autoComplete: "tel" },
  { key: "postalCode", label: "Código postal", autoComplete: "postal-code", inputMode: "numeric" },
  { key: "street", label: "Calle y número (exterior e interior)", autoComplete: "street-address", span: true },
  { key: "neighborhood", label: "Colonia", autoComplete: "address-level3" },
  { key: "city", label: "Ciudad o municipio", autoComplete: "address-level2" },
  { key: "state", label: "Estado", autoComplete: "address-level1" },
  { key: "reference", label: "Referencias para la entrega", autoComplete: "off", optional: true },
];
const emptyAddress: Address = { name: "", phone: "", street: "", neighborhood: "", postalCode: "", city: "", state: "", reference: "" };

/**
 * 08 · Checkout: contacto → entrega (recolección o envío cotizado) → confirmación → pago en la pasarela.
 * Pide solo datos necesarios, nunca datos de tarjeta, y muestra el total definitivo antes de pagar (CLAUDE.md §14).
 */
export function CheckoutView() {
  const { lines, ready, clear } = useCart();
  const { quote, loading } = useCartQuote();
  const [options, setOptions] = useState<DeliveryOptionsResponse | null>(null);
  const [method, setMethod] = useState<"pickup" | "shipping" | null>(null);
  const [pickupPointId, setPickupPointId] = useState("");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteResponse | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())));
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getStoreApi().deliveryOptions().then((result) => result.ok && setOptions(result.data));
  }, []);

  const rate = shippingQuote?.rates.find((r) => r.id === rateId) ?? null;
  const currency = quote?.total.currency ?? "mxn";
  const shippingAmount = method === "pickup" ? 0 : rate?.price.amount ?? null;
  const total = quote ? quote.total.amount + (shippingAmount ?? 0) : null;

  function setAddressField(key: keyof Address, value: string) {
    setAddress((current) => ({ ...current, [key]: key === "postalCode" ? value.replace(/\D/g, "").slice(0, 5) : value }));
    if (shippingQuote && ["postalCode", "state", "city", "neighborhood"].includes(key)) {
      setShippingQuote(null);
      setRateId(null);
    }
  }

  function addressErrors(): Errors {
    const e: Errors = {};
    for (const field of ADDRESS_FIELDS) if (!field.optional && !String(address[field.key] ?? "").trim()) e[`address.${field.key}`] = ["Campo obligatorio."];
    if (address.postalCode && !/^\d{5}$/.test(address.postalCode)) e["address.postalCode"] = ["Código postal de 5 dígitos."];
    return e;
  }

  async function requestShippingQuote() {
    const e = addressErrors();
    delete e["address.name"];
    delete e["address.phone"];
    delete e["address.street"];
    if (Object.keys(e).length) return setErrors((current) => ({ ...current, ...e }));
    setQuoting(true);
    const result = await getStoreApi().quoteShipping({ lines, postalCode: address.postalCode, state: address.state, city: address.city, neighborhood: address.neighborhood });
    setQuoting(false);
    if (result.ok) {
      setShippingQuote(result.data);
      setRateId(result.data.rates[0]?.id ?? null);
      setErrors((current) => {
        const rest = { ...current };
        delete rest.shipping;
        return rest;
      });
    } else {
      setErrors((current) => ({ ...current, shipping: [result.error.message], ...(result.error.fieldErrors ? Object.fromEntries(Object.entries(result.error.fieldErrors).map(([k, v]) => [`address.${k}`, v])) : {}) }));
    }
  }

  function focusProblem() {
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (target ?? alertRef.current)?.focus();
      (target ?? alertRef.current)?.scrollIntoView({ block: "center" });
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const e: Errors = {};
    if (fullName.length < 2) e.fullName = ["Escribe tu nombre completo."];
    if (!EMAIL.test(email)) e.email = ["Correo no válido."];
    if (!method) e.deliveryMethod = ["Elige cómo quieres recibir tu pedido."];
    if (method === "pickup" && !pickupPointId) e.pickupPointId = ["Elige el punto de recolección."];
    if (method === "shipping") {
      Object.assign(e, addressErrors());
      if (!shippingQuote || !rateId) e.shipping = ["Calcula el envío y elige una opción."];
    }
    if (form.get("acceptTerms") !== "on") e.acceptTerms = ["Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para continuar."];
    setErrors(e);
    setFormError(Object.keys(e).length ? "Revisa los datos marcados." : null);
    if (Object.keys(e).length || !options || !quote) return focusProblem();

    setSubmitting(true);
    const result = await getStoreApi().checkout(
      {
        contact: { fullName, email, phone: String(form.get("phone") ?? "").trim() || undefined },
        lines,
        delivery: method === "pickup" ? { method: "pickup", pickupPointId } : { method: "shipping", quoteId: shippingQuote!.quoteId, rateId: rateId!, address: { ...address, reference: address.reference || undefined } },
        acceptTerms: true,
        termsVersion: options.termsVersion,
        marketingConsent: form.get("marketingConsent") === "on",
        website: String(form.get("website") ?? ""),
      },
      idempotencyKey,
    );
    if (result.ok) {
      if (getStoreApi().mode === "mock") clear();
      window.location.assign(result.data.checkoutUrl);
      return;
    }
    setSubmitting(false);
    setErrors(result.error.fieldErrors ?? {});
    setFormError(result.error.message);
    focusProblem();
  }

  if (ready && !lines.length) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h2 className="font-serif text-4xl font-medium">No hay productos para pagar.</h2>
        <p className="mt-3 text-muted">Agrega algo a tu carrito para continuar.</p>
        <ButtonLink href="/productos" className="mt-8">Ir a la tienda</ButtonLink>
      </div>
    );
  }

  const money = (amount: number) => formatMoney(amount, currency);
  const done = {
    contact: false,
    delivery: method === "pickup" ? !!pickupPointId : method === "shipping" ? !!rate : false,
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-12">
      <div className="space-y-8">
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          {formError && <p role="alert" className="border border-danger/30 border-l-4 border-l-danger bg-danger/5 px-4 py-3 text-sm text-danger">{formError}</p>}
        </div>

        <FormSection step="1" title="Contacto" description="Para enviarte la confirmación y el seguimiento." id="paso-contacto" complete={done.contact}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field name="fullName" label="Nombre completo" autoComplete="name" errors={errors.fullName} className="sm:col-span-2" />
            <Field name="email" label="Correo electrónico" type="email" autoComplete="email" errors={errors.email} />
            <Field name="phone" label="Teléfono" type="tel" autoComplete="tel" optional errors={errors.phone} />
          </div>
        </FormSection>

        <FormSection step="2" title="Entrega" description="¿Cómo quieres recibir tu pedido?" id="paso-entrega" complete={done.delivery}>
          {!options ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Cargando opciones de entrega…</p>
          ) : (
            <fieldset aria-describedby={errors.deliveryMethod ? "deliveryMethod-error" : undefined}>
              <legend className="sr-only">Método de entrega</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {options.shipping.enabled && (
                  <ChoiceTile type="radio" name="deliveryMethod" align="start" checked={method === "shipping"} onChange={() => setMethod("shipping")} invalid={!!errors.deliveryMethod} description="A todo México. Calculamos el envío con tu dirección.">
                    <span className="flex items-center gap-2 font-semibold"><TruckIcon className="size-4" /> Envío a domicilio</span>
                  </ChoiceTile>
                )}
                {options.pickup.enabled && (
                  <ChoiceTile type="radio" name="deliveryMethod" align="start" checked={method === "pickup"} onChange={() => setMethod("pickup")} invalid={!!errors.deliveryMethod} description="Sin costo de envío. Te avisamos cuando esté listo.">
                    <span className="flex items-center gap-2 font-semibold"><MapPinIcon className="size-4" /> Recolección en Chihuahua · $0</span>
                  </ChoiceTile>
                )}
              </div>
              <FieldError id="deliveryMethod" errors={errors.deliveryMethod} />
            </fieldset>
          )}

          {method === "pickup" && options && (
            <fieldset aria-describedby={errors.pickupPointId ? "pickupPointId-error" : undefined}>
              <legend className="block text-[0.9375rem] font-semibold">Punto de recolección</legend>
              <div className="mt-3 grid gap-3">
                {options.pickup.points.map((point) => (
                  <ChoiceTile key={point.id} type="radio" name="pickupPointId" align="start" checked={pickupPointId === point.id} onChange={() => setPickupPointId(point.id)} invalid={!!errors.pickupPointId} description={point.schedule}>
                    <span className="font-semibold">{point.name}</span>
                  </ChoiceTile>
                ))}
              </div>
              <FieldError id="pickupPointId" errors={errors.pickupPointId} />
              <p className="mt-3 text-sm text-muted">Te avisaremos por correo cuando tu pedido esté LISTO PARA RECOGER. Espera ese aviso antes de acudir.</p>
            </fieldset>
          )}

          {method === "shipping" && (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                {ADDRESS_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    name={`address.${field.key}`}
                    label={field.label}
                    optional={field.optional}
                    autoComplete={field.autoComplete}
                    inputMode={field.inputMode}
                    value={address[field.key] ?? ""}
                    onChange={(e: { target: { value: string } }) => setAddressField(field.key, e.target.value)}
                    errors={errors[`address.${field.key}`]}
                    className={field.span ? "sm:col-span-2" : undefined}
                  />
                ))}
              </div>
              <div id="shipping" aria-live="polite" className="space-y-3">
                {!shippingQuote ? (
                  <Button type="button" variant="outline" size="md" onClick={requestShippingQuote} loading={quoting} disabled={quoting}>
                    {quoting ? "Calculando envío…" : "Calcular envío"}
                  </Button>
                ) : (
                  <fieldset>
                    <legend className="block text-[0.9375rem] font-semibold">Elige tu envío</legend>
                    <div className="mt-3 grid gap-3">
                      {shippingQuote.rates.map((r) => (
                        <ChoiceTile key={r.id} type="radio" name="rate" align="start" checked={rateId === r.id} onChange={() => setRateId(r.id)} description={`${r.carrier} · ${r.service}${r.days ? ` · ${r.days} días hábiles aprox.` : ""}`}>
                          <span className="flex items-baseline justify-between gap-3"><span className="font-semibold">{r.label}</span><span className="font-semibold lining-nums">{formatMoney(r.price.amount, r.price.currency)}</span></span>
                        </ChoiceTile>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">Tarifa de la paquetería al momento de cotizar.</p>
                  </fieldset>
                )}
                <FieldError id="shipping" errors={errors.shipping} />
              </div>
            </div>
          )}
          <p className="text-sm"><Link href={legalPaths.shipping} target="_blank" rel="noopener" className="text-muted underline underline-offset-4 hover:text-fg">Consulta nuestra Política de Envíos y Recolección</Link></p>
        </FormSection>
        <Honeypot />
      </div>

      <aside aria-labelledby="resumen-checkout" className="self-start border border-border bg-[#fffdf9] shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] lg:sticky lg:top-24">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
          <h2 id="resumen-checkout" className="font-serif text-2xl font-medium">Resumen del pedido</h2>
          <Link href="/carrito" className="text-sm text-muted underline underline-offset-4 hover:text-fg">Editar</Link>
        </header>
        <div className="space-y-6 px-6 py-6">
          {loading && !quote ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Calculando…</p>
          ) : (
            <ul className="space-y-4">
              {quote?.lines.map((line) => (
                <li key={line.productId} className="flex gap-3">
                  <span className="relative size-16 shrink-0 overflow-hidden bg-sand">
                    <Image src={line.image.src} alt="" fill sizes="64px" className="object-cover" />
                    <span className="absolute -top-0 -right-0 grid min-w-5 place-items-center rounded-bl bg-ink px-1 text-[0.625rem] leading-5 font-semibold text-on-ink">{line.quantity}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{line.name}</span>
                    <span className="block text-xs text-muted lining-nums">{formatMoney(line.unitPrice.amount, line.unitPrice.currency)} c/u</span>
                  </span>
                  <span className="font-semibold lining-nums tabular-nums">{formatMoney(line.subtotal.amount, line.subtotal.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="space-y-3 border-t border-border pt-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="lining-nums">{quote ? money(quote.subtotal.amount) : "—"}</dd></div>
            {quote?.discount && <div className="flex justify-between text-success"><dt>Descuento</dt><dd className="lining-nums">−{money(quote.discount.amount)}</dd></div>}
            <div className="flex justify-between">
              <dt className="text-muted">{method === "pickup" ? "Recolección en Chihuahua" : "Envío"}</dt>
              <dd className="lining-nums">{method === "pickup" ? <span className="text-success">$0</span> : rate ? money(rate.price.amount) : <span className="text-muted">Por calcular</span>}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t-2 border-fg pt-4">
              <dt className="text-base font-semibold">Total</dt>
              <dd key={total ?? 0} className="animate-tick font-serif text-4xl font-medium lining-nums" aria-live="polite">{total !== null ? money(total) : "—"}</dd>
            </div>
            {method === "shipping" && !rate && <p className="text-right text-xs text-muted">Calcula el envío para ver el total definitivo.</p>}
          </dl>

          <div className="space-y-3">
            <div>
              <ChoiceTile type="checkbox" name="acceptTerms" align="start" invalid={!!errors.acceptTerms}>
                {/* Los Términos vigentes son los de la preventa; los de la tienda están pendientes de redacción (ver BACKEND-REQUEST). */}
                <span className="text-[0.8125rem] leading-relaxed">
                  He leído y acepto los <Link href={legalPaths.terms} target="_blank" rel="noopener" className="underline underline-offset-4">Términos y Condiciones</Link> y el{" "}
                  <Link href={legalPaths.privacy} target="_blank" rel="noopener" className="underline underline-offset-4">Aviso de Privacidad</Link>.
                </span>
              </ChoiceTile>
              <FieldError id="acceptTerms" errors={errors.acceptTerms} />
            </div>
            <label className="flex cursor-pointer items-start gap-3.5 px-4 text-xs text-muted">
              <input type="checkbox" name="marketingConsent" className="choice" />
              <span className="pt-0.5">Quiero recibir noticias de inttimo por correo. (opcional)</span>
            </label>
          </div>

          <Button type="submit" variant="bronze" block arrow="right" loading={submitting} disabled={submitting || loading}>
            {submitting ? "Preparando pago…" : total !== null ? `Pagar ${money(total)}` : "Pagar"}
          </Button>
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted"><LockIcon className="size-3.5 shrink-0" /> Pagarás en la página segura de Stripe. No guardamos datos de tu tarjeta.</p>
        </div>
      </aside>
    </form>
  );
}
