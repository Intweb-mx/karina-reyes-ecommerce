import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/store/FaqList";
import { ContactForm } from "@/components/store/forms/ContactForm";
import { PageHero } from "@/components/store/PageHero";
import { SupportChannels } from "@/components/store/SupportChannels";
import { faqs } from "@/content/store";

export const metadata: Metadata = { title: "Contacto" };

/** 13 · Contacto / soporte: formulario con categorías, canales directos, ruta para iglesias y preguntas rápidas. */
export default function ContactoPage() {
  const quick = faqs.filter((faq) => ["como-comprar", "metodos-pago", "envios-mexico", "tiempo-preparacion", "devoluciones"].includes(faq.id));
  return (
    <main>
      <PageHero eyebrow="Contacto" title={<>Hablemos. <em className="font-normal">Estamos para ti.</em></>} body="Si tienes alguna pregunta, duda o necesitas apoyo, nuestro equipo está listo para ayudarte." size="sm" />
      <div className="container-page grid gap-12 section-y lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="mensaje" className="border border-border bg-[#fffdf9] p-6 shadow-[0_30px_60px_-40px_rgb(34_28_23/0.45)] sm:p-8">
          <h2 id="mensaje" className="font-serif text-3xl font-medium">Envíanos un mensaje</h2>
          <p className="mt-1 mb-7 text-sm text-muted">Te responderemos a la brevedad.</p>
          <ContactForm />
        </section>
        <aside className="space-y-10">
          <div>
            <h2 className="font-serif text-2xl font-medium">Otras formas de contacto</h2>
            <div className="mt-4"><SupportChannels withChurch /></div>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium">Preguntas rápidas</h2>
            <div className="mt-4"><FaqList faqs={quick} /></div>
            <Link href="/ayuda" className="mt-4 inline-block text-sm underline underline-offset-4">Ver todas las preguntas</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
