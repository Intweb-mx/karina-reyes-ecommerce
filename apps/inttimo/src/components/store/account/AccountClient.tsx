"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { AccountView } from "@/lib/store/contract";
import { Button, ButtonLink } from "@/components/ui/Button";
import { BoxIcon, MailIcon, MapPinIcon, UserIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { getStoreApi } from "@/lib/store/api";
import { formatMoney } from "@/lib/format";
import { Field } from "../forms/Field";
import { EMAIL } from "../forms/useStoreForm";
import { FULFILLMENT_TEXT } from "../order/OrderParts";

/**
 * 10 · Mi cuenta: acceso sin contraseña (enlace al correo) e historial, direcciones y preferencias.
 * Comprar como invitado siempre es posible (CLAUDE.md §25). Métodos de pago guardados y wishlist: fase posterior.
 */
export function AccountClient() {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [demoSession, setDemoSession] = useState(false);

  useEffect(() => {
    // Sin backend no hay sesión real: en modo demostración la cuenta de ejemplo se ve solo al "entrar".
    const load = getStoreApi().mode === "mock" && !demoSession ? Promise.resolve(null) : getStoreApi().account().then((result) => (result.ok ? result.data : null));
    void load.then(setAccount);
  }, [demoSession]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!EMAIL.test(email)) return setError("Correo no válido.");
    setError(null);
    setSending(true);
    const result = await getStoreApi().requestAccountAccess({ email });
    setSending(false);
    if (result.ok) setSent(true);
    else setError(result.error.message);
  }

  if (account === undefined) return <p className="flex items-center gap-3 py-16 text-muted"><Spinner className="size-5" /> Cargando…</p>;

  if (!account) {
    return (
      <div className="grid gap-10 lg:grid-cols-2">
        <section className="border border-border bg-[#fffdf9] p-6 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-8">
          <h2 className="font-serif text-3xl font-medium">Entrar a mi cuenta</h2>
          <p className="mt-2 text-sm text-muted">Sin contraseñas: te enviamos un enlace seguro a tu correo.</p>
          {sent ? (
            <div role="status" className="mt-6 border border-success/30 bg-success/5 p-5">
              <p className="flex items-center gap-2 font-semibold"><MailIcon className="size-5" /> Revisa tu correo</p>
              <p className="mt-1 text-sm text-muted">Si hay compras con ese correo, te llegará un enlace para entrar. Puede tardar unos minutos.</p>
              {getStoreApi().mode === "mock" && (
                <button type="button" onClick={() => setDemoSession(true)} className="mt-4 text-sm font-semibold underline underline-offset-4">Ver cuenta de ejemplo (modo demostración)</button>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <Field name="email" label="Correo electrónico" type="email" autoComplete="email" errors={error ? [error] : undefined} />
              <Button type="submit" block arrow="right" loading={sending} disabled={sending}>{sending ? "Enviando…" : "Enviarme el enlace"}</Button>
            </form>
          )}
        </section>
        <section className="flex flex-col justify-center">
          <h2 className="font-serif text-3xl font-medium">¿Compraste como invitado?</h2>
          <p className="mt-2 leading-relaxed text-muted">No necesitas cuenta para comprar ni para seguir tu pedido. Con tu número de pedido y tu correo puedes rastrearlo en cualquier momento.</p>
          <ButtonLink href="/rastrear-pedido" variant="outline" arrow="right" className="mt-6 w-fit">Rastrear un pedido</ButtonLink>
        </section>
      </div>
    );
  }

  const address = account.addresses.find((a) => a.isDefault) ?? account.addresses[0];
  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow text-muted">Mi cuenta</p>
        <h2 className="mt-3 font-serif text-[clamp(2.5rem,5vw,4rem)] leading-none font-medium">Hola, {account.firstName}.</h2>
        <p className="mt-2 text-muted">{account.email}</p>
      </header>

      <section aria-labelledby="mis-pedidos" className="border border-border bg-[#fffdf9]">
        <h3 id="mis-pedidos" className="flex items-center gap-2 border-b border-border px-6 py-4 font-semibold"><BoxIcon className="size-5" /> Mis pedidos</h3>
        {account.orders.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">Aún no tienes pedidos. <Link href="/productos" className="underline underline-offset-4">Ir a la tienda</Link></p>
        ) : (
          <ul className="divide-y divide-border">
            {account.orders.map((order) => (
              <li key={order.orderNumber} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="font-mono font-semibold">{order.orderNumber}</p>
                  <p className="text-muted">{new Date(order.createdAt).toLocaleDateString("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" })}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${order.fulfillmentStatus === "delivered" ? "border-success/40 bg-success/15 text-success" : "border-warning/40 bg-warning/15 text-warning"}`}>{FULFILLMENT_TEXT[order.fulfillmentStatus]}</span>
                <span className="font-semibold lining-nums">{formatMoney(order.total.amount, order.total.currency)}</span>
                <Link href={`/rastrear-pedido?pedido=${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-bronze underline-offset-4 hover:underline">Ver detalle →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border border-border bg-[#fffdf9] p-6">
          <h3 className="flex items-center gap-2 font-semibold"><MapPinIcon className="size-5" /> Dirección principal</h3>
          {address ? (
            <p className="mt-3 text-sm text-muted">{address.name}<br />{address.street}, {address.neighborhood}<br />{address.postalCode} {address.city}, {address.state}</p>
          ) : (
            <p className="mt-3 text-sm text-muted">Guardaremos tu dirección en tu próxima compra.</p>
          )}
        </section>
        <section className="border border-border bg-[#fffdf9] p-6">
          <h3 className="flex items-center gap-2 font-semibold"><UserIcon className="size-5" /> Preferencias</h3>
          <p className="mt-3 text-sm text-muted">Noticias por correo: {account.marketingConsent ? "activadas" : "desactivadas"}.</p>
          <p className="mt-1 text-xs text-muted">Pronto podrás cambiar tus datos y preferencias desde aquí.</p>
        </section>
      </div>
    </div>
  );
}
