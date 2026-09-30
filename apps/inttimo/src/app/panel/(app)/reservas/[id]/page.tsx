import { findReservationById, getCampaignById, getTermsById, listReservationEvents } from "@inttimo/database";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { audit, requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/presale/runtime";
import { Card, STATUS_LABELS } from "../../../ui";

export const metadata = { title: "Reserva" };

const when = (date: Date | null) => (date ? date.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : "—");

function answerText(value: unknown, options?: { value: string; label: string }[]): string {
  const label = (v: string) => options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") return label(value);
  return "—";
}

function stripePaymentUrl(paymentIntentId: string): string {
  // Claves live: sk_live_… (estándar) o rk_live_… (restringida).
  const test = !/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  return `https://dashboard.stripe.com/${test ? "test/" : ""}payments/${paymentIntentId}`;
}

export default async function ReservationPage({ params }: PageProps<"/panel/reservas/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const reservation = await findReservationById(db, id);
  if (!reservation) notFound();
  const [campaign, terms, events] = await Promise.all([
    getCampaignById(db, reservation.campaignId),
    getTermsById(db, reservation.termsId),
    listReservationEvents(db, reservation.id),
  ]);
  await audit(admin, { action: "reservation.view", targetType: "reservation", targetId: reservation.id });

  const address = reservation.shippingAddress;
  const rows: [string, React.ReactNode][] = [
    ["Estado", STATUS_LABELS[reservation.status]],
    ["Nombre", reservation.fullName],
    ["Correo", reservation.email],
    ["Teléfono", reservation.phone ?? "—"],
    ["Cantidad", reservation.quantity],
    ["Total", formatMoney(reservation.totalAmount, reservation.currency)],
    ["Reembolsado", reservation.amountRefunded ? formatMoney(reservation.amountRefunded, reservation.currency) : "—"],
    ["Creada", when(reservation.createdAt)],
    ["Pagada", when(reservation.paidAt)],
    ["Términos aceptados", terms ? `Versión ${terms.version} · ${when(reservation.termsAcceptedAt)}` : "—"],
    ["Acepta marketing", reservation.marketingConsent ? "Sí" : "No"],
    ["Correo de confirmación", when(reservation.confirmationEmailSentAt)],
    [
      "Pago en Stripe",
      reservation.stripePaymentIntentId ? (
        <a href={stripePaymentUrl(reservation.stripePaymentIntentId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          {reservation.stripePaymentIntentId}
        </a>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <div className="space-y-6">
      <div>
        {campaign && <Link href={`/panel/campanas/${campaign.slug}`} className="text-sm text-muted">← {campaign.productName}</Link>}
        <h1 className="mt-1 font-mono text-2xl">{reservation.code}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Reserva">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Dirección de envío">
            {address ? (
              <address className="text-sm not-italic">
                {address.name}<br />
                {address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />
                {address.postalCode} {address.city}, {address.state}<br />
                {address.country}
              </address>
            ) : (
              <p className="text-sm text-muted">Se captura al pagar en Stripe.</p>
            )}
          </Card>

          <Card title="Cuestionario">
            <dl className="space-y-3 text-sm">
              {(campaign?.questions ?? []).map((q) => (
                <div key={q.id}>
                  <dt className="text-muted">{q.label}</dt>
                  <dd>{answerText(reservation.answers[q.id], q.options)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <Card title="Historial">
        <ol className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="grid grid-cols-[11rem_1fr] gap-4">
              <span className="text-muted">{when(event.createdAt)}</span>
              <span>
                <span className="font-mono text-xs">{event.type}</span> · {event.source}
                {event.externalRef && <span className="text-muted"> · {event.externalRef}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
