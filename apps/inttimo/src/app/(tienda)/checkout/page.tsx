import type { Metadata } from "next";
import { CheckoutSteps } from "@/components/store/checkout/CheckoutSteps";
import { CheckoutView } from "@/components/store/checkout/CheckoutView";

export const metadata: Metadata = { title: "Finalizar compra" };

export default function CheckoutPage() {
  return (
    <main className="container-page section-y">
      <CheckoutSteps current={1} />
      <p className="eyebrow text-muted">Finalizar compra</p>
      <h1 className="mt-3 mb-10 max-w-2xl font-serif text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] font-medium">
        Un paso más hacia <em className="font-normal">más conversaciones</em>.
      </h1>
      <CheckoutView />
    </main>
  );
}
