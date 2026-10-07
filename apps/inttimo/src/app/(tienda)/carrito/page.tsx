import type { Metadata } from "next";
import { CheckoutSteps } from "@/components/store/checkout/CheckoutSteps";
import { CartView } from "@/components/store/cart/CartView";

export const metadata: Metadata = { title: "Tu carrito" };

export default function CarritoPage() {
  return (
    <main className="container-page section-y">
      <CheckoutSteps current={0} />
      <p className="eyebrow text-muted">Carrito de compras</p>
      <h1 className="mt-3 mb-10 font-serif text-[clamp(2.75rem,6vw,4.5rem)] leading-none font-medium">Tu carrito</h1>
      <CartView />
    </main>
  );
}
