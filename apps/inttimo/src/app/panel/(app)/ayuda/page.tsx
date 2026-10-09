import Link from "next/link";
import type { ReactNode } from "react";
import { storeEnabled } from "@/lib/store/flags";
import { requireAdmin } from "@/server/auth/admin";
import { Badge, Card, FULFILLMENT_LABELS, FULFILLMENT_TONES, PageHeader, STATUS_LABELS, STATUS_TONES } from "../../ui";

export const metadata = { title: "Cómo usar el panel" };

/** Qué significa cada estado, en palabras simples. Las etiquetas vienen de ui.tsx para que siempre coincidan. */
const STATUS_HELP: Record<string, string> = {
  pending_payment: "La persona empezó a comprar pero no ha pagado. No se prepara nada.",
  processing: "Eligió pagar en OXXO y Stripe espera la confirmación. No se prepara todavía.",
  paid: "Pagado y confirmado por Stripe. Este pedido sí se prepara.",
  payment_failed: "El banco rechazó el pago. No se prepara.",
  expired: "No terminó de pagar a tiempo. No se prepara.",
  partially_refunded: "Se devolvió una parte del dinero desde Stripe.",
  refunded: "Se devolvió todo el dinero desde Stripe. No se envía.",
  canceled: "Pedido cancelado. No se envía.",
};

const FULFILLMENT_HELP: Record<string, string> = {
  pending: "Pagado y esperando que lo preparemos.",
  ready_for_pickup: "Ya se avisó al cliente por correo que puede pasar a recoger.",
  shipped: "Ya tiene guía y salió con la paquetería.",
  delivered: "El cliente ya lo tiene. No hay nada más que hacer.",
};

export default async function PanelHelpPage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <PageHeader title="Cómo usar el panel" subtitle="Todo lo que necesitas para atender pedidos, sin conocimientos técnicos." />

      <nav aria-label="En esta guía" className="flex flex-wrap gap-2 text-sm">
        {[
          ["#secciones", "Qué hay en cada sección"],
          ["#rutina", "Rutina diaria"],
          ["#estados", "Qué significa cada estado"],
          ["#problemas", "Si algo sale mal"],
          ["#seguridad", "Seguridad"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="inline-flex min-h-9 items-center rounded-full border border-border bg-[#fffdf9] px-3.5 transition-colors hover:border-fg/40">{label}</a>
        ))}
      </nav>

      <section id="secciones" className="scroll-mt-20 space-y-4">
        <h2 className="font-serif text-2xl font-medium">Qué hay en cada sección</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Guide title="Hoy" href="/panel">
            Es la pantalla de inicio. Reúne lo que hay que atender, del pedido más antiguo al más reciente, en cinco tarjetas: <strong>Generar guía</strong>, <strong>Entregar a la paquetería</strong>, <strong>Avisar que está listo</strong>, <strong>Esperando que lo recojan</strong> y <strong>Problemas por resolver</strong>. Si un pedido lleva 3 días o más esperando, se marca en amarillo.
          </Guide>
          <Guide title="Pedidos" href="/panel/pedidos">
            La lista completa de compras, con pestañas para filtrar. Puedes buscar por nombre, correo, teléfono, folio o número de guía y <strong>descargar la lista en Excel</strong>. Al abrir un pedido ves los datos del cliente, la entrega, sus respuestas, notas internas, los botones para reenviar correos y todo su historial. En <strong>Resumen de la preventa</strong> ves ventas, piezas disponibles y el cierre.
          </Guide>
          <Guide title="Configurar preventa">
            Fechas de apertura y cierre, precio, máximo por compra, entregas (envío y recolección) y los términos. <strong>Los cambios se ven en la página en cuanto guardas</strong>: revísalos con calma.
          </Guide>
          <Guide title="Actividad" href="/panel/bitacora">
            Registro de quién hizo qué en el panel (entradas, guías generadas, cambios de configuración). No se puede editar ni borrar.
          </Guide>
          {storeEnabled && (
            <Guide title="Tienda (demo)" href="/panel/tienda">
              El panel de la tienda completa: pedidos, productos e inventario y solicitudes de contacto e iglesias. <strong>Hoy usa datos de ejemplo</strong>; funcionará con datos reales cuando el backend de la tienda esté listo.
            </Guide>
          )}
        </div>
      </section>

      <section id="rutina" className="scroll-mt-20 space-y-4">
        <h2 className="font-serif text-2xl font-medium">Rutina diaria</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Pedidos con envío a domicilio">
            <Steps
              steps={[
                <>Abre <strong>Hoy</strong> y entra al pedido más antiguo de la tarjeta &quot;Generar guía&quot;. En el pedido, el bloque <strong>Siguiente paso</strong> te dice qué botón presionar.</>,
                <>Presiona <strong>Generar guía</strong>. Esto compra la guía; al cliente todavía no se le avisa nada.</>,
                <>Presiona <strong>Imprimir guía</strong> y pégala en la caja.</>,
                <>Entrega el paquete a la paquetería y presiona <strong>Entregué el paquete a la paquetería</strong>. Ahí el pedido pasa a ENVIADO y el cliente recibe por correo su número de guía.</>,
                <>Cuando la paquetería lo entregue, regresa al pedido y presiona <strong>Marcar como ENTREGADO</strong>. Ahí el cliente recibe por correo el acceso a su bonus.</>,
              ]}
            />
          </Card>
          <Card title="Pedidos para recoger en Chihuahua">
            <Steps
              steps={[
                <>Abre <strong>Hoy</strong> y entra al pedido de la tarjeta &quot;Avisar que está listo&quot;.</>,
                <>Cuando el pedido esté listo en el punto de recolección, presiona <strong>Marcar LISTO PARA RECOGER y avisar</strong>. El cliente recibe un correo.</>,
                <>Cuando el cliente lo recoja, presiona <strong>Marcar como ENTREGADO</strong>.</>,
              ]}
            />
            <p className="mt-4 text-sm text-muted">El cliente solo debe acudir después de recibir el aviso.</p>
          </Card>
        </div>
      </section>

      <section id="estados" className="scroll-mt-20 space-y-4">
        <h2 className="font-serif text-2xl font-medium">Qué significa cada estado</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Pago" description="Lo informa Stripe automáticamente. No se cambia a mano.">
            <dl className="space-y-3 text-sm">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start">
                  <dt><Badge tone={STATUS_TONES[key]}>{label}</Badge></dt>
                  <dd className="text-muted">{STATUS_HELP[key]}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Entrega" description="Lo actualizas tú con los botones del pedido.">
            <dl className="space-y-3 text-sm">
              {Object.entries(FULFILLMENT_LABELS).map(([key, label]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start">
                  <dt><Badge tone={FULFILLMENT_TONES[key]}>{label}</Badge></dt>
                  <dd className="text-muted">{FULFILLMENT_HELP[key]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </section>

      <section id="problemas" className="scroll-mt-20 space-y-4">
        <h2 className="font-serif text-2xl font-medium">Si algo sale mal</h2>
        <div className="divide-y divide-border border border-border bg-[#fffdf9]">
          <Faq q="No se pudo generar la guía.">
            Revisa que el pedido tenga la dirección completa. Si falta algo, pide los datos al cliente con los botones de correo o WhatsApp del pedido. Si generas la guía por fuera (directo en SkyDropX), regístrala en el pedido con la opción <strong>&quot;¿Hiciste la guía por fuera del panel?&quot;</strong>.
          </Faq>
          <Faq q="El cliente dice que no le llegó el bonus.">
            Abre el pedido: si el envío del bonus falló, aparece el botón <strong>Reintentar bonus</strong>.
          </Faq>
          <Faq q="Hay que devolver el dinero.">
            Los reembolsos se hacen en el panel de Stripe. El pedido cambia a &quot;Reembolsada&quot; o &quot;Reembolso parcial&quot; en cuanto Stripe lo confirma.
          </Faq>
          <Faq q="Un pedido aparece como pago pendiente u OXXO.">
            No lo prepares. Cuando Stripe confirme el pago, aparece solo en Hoy.
          </Faq>
          <Faq q="No encuentro un pedido.">
            En <strong>Pedidos</strong>, busca por nombre, correo, teléfono, folio o número de guía y revisa que estés en la pestaña &quot;Todos&quot;.
          </Faq>
        </div>
      </section>

      <section id="seguridad" className="scroll-mt-20 space-y-4">
        <h2 className="font-serif text-2xl font-medium">Seguridad</h2>
        <Card>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Cada persona entra con su propia cuenta y su código de verificación en dos pasos. No compartas tu cuenta.</li>
            <li>Si perdiste tu código o necesitas dar acceso a alguien más, pídelo al equipo técnico.</li>
            <li>Al terminar en una computadora compartida, presiona <strong>Salir</strong> (abajo en la barra lateral).</li>
            <li>Todo lo que haces queda registrado en <Link prefetch={false} href="/panel/bitacora" className="underline underline-offset-4">Actividad</Link>.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Guide({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-[#fffdf9] p-5">
      <h3 className="font-semibold">{href ? <Link prefetch={false} href={href} className="underline-offset-4 hover:underline">{title} →</Link> : title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-xs font-semibold text-bg lining-nums">{index + 1}</span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
        {q}
        <span aria-hidden="true" className="text-bronze transition-transform group-open:rotate-45">+</span>
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </details>
  );
}
