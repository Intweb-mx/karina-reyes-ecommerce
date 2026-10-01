import type { PresaleCampaign, PresaleReservation } from "@inttimo/database";

function escape(value: unknown): string {
  const text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel / Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** CSV con BOM (Excel lo abre en UTF-8). Una columna por pregunta del cuestionario. */
export function buildReservationsCsv(campaign: PresaleCampaign, rows: PresaleReservation[]): string {
  const questionIds = campaign.questions.map((q) => q.id);
  const header = [
    "folio", "estado", "nombre", "email", "telefono", "cantidad", "metodo_entrega", "envio_centavos", "total_centavos", "moneda", "reembolsado_centavos",
    "estado_entrega", "paqueteria", "guia", "enviado_o_listo_en", "entregado_en", "bonus_enviado_en",
    "pagada_en", "creada_en", "acepta_marketing",
    "envio_nombre", "envio_calle", "envio_calle2", "envio_ciudad", "envio_estado", "envio_cp", "envio_pais",
    ...questionIds.map((id) => `respuesta_${id}`),
  ];
  const lines = rows.map((r) =>
    [
      r.code, r.status, r.fullName, r.email, r.phone, r.quantity, r.deliveryMethod, r.shippingAmount, r.totalAmount, r.currency, r.amountRefunded,
      r.fulfillmentStatus, r.carrier, r.trackingNumber, r.fulfilledAt?.toISOString(), r.deliveredAt?.toISOString(), r.bonusSentAt?.toISOString(),
      r.paidAt?.toISOString(), r.createdAt.toISOString(), r.marketingConsent ? "si" : "no",
      r.shippingAddress?.name, r.shippingAddress?.line1, r.shippingAddress?.line2, r.shippingAddress?.city,
      r.shippingAddress?.state, r.shippingAddress?.postalCode, r.shippingAddress?.country,
      ...questionIds.map((id) => r.answers[id]),
    ]
      .map(escape)
      .join(","),
  );
  return `﻿${[header.map(escape).join(","), ...lines].join("\n")}\n`;
}
