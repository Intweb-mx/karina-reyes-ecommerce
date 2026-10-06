# Subproyecto 1 — Ordenar el panel de la preventa

- **Estado:** aprobado por el usuario (2026-10-06)
- **Plan general:** [PLAN.md](./PLAN.md), Fase A, pasos 1 a 4
- **Reparto:** nosotros hacemos el backend, el contrato tipado y pantallas base funcionales; Alan las rediseña después.
- **Depende de:** PR #18 (`feat/frontend-panel-ux`, de Alan), que reestiliza el panel. Mergearlo antes de empezar las pantallas y construir sobre sus componentes (`PanelNav`, badges, `ui.tsx`).

## Objetivo

Karina abre el panel y ve qué tiene que hacer. Encuentra cualquier pedido en segundos. En cada pedido hay un solo botón con el siguiente paso. Ningún correo dice "va en camino" antes de que el paquete se entregue a la paquetería.

## 1. Corrección: guía generada ≠ enviado

**Hoy:** `generateLabel` (`server/presale/shipping.ts`), en cuanto recibe el número de guía, llama a `fulfillReservation({ type: "shipped" })`. Eso marca ENVIADO, manda el correo "ya va en camino" y libera el bonus.

**Regla de Karina (2026-10-02):** el estado ENVIADO, su correo y el bonus solo se disparan cuando el paquete se entrega físicamente a la paquetería.

**Cambio:**
- `generateLabel` guarda `shipmentId`, `labelUrl`, `carrier`, `trackingNumber` y `trackingUrl`, y registra el evento `LABEL_CREATED`. El pedido sigue en `fulfillmentStatus = "pending"` y no se manda correo.
- `saveLabel` (`packages/database`) acepta además `carrier`, `trackingNumber` y `trackingUrl`.
- Nueva acción **`handToCarrier(reservationId)`**: requiere guía guardada. Llama a `fulfillReservation({ type: "shipped", shipment: <datos guardados> })`, que se encarga del correo y del bonus.
- "Registrar guía hecha por fuera" no cambia: marca ENVIADO directamente, porque quien la registra ya entregó el paquete.

Sin migración: las columnas ya existen.

## 2. Contrato backend: `apps/inttimo/src/server/admin/`

Es la única puerta entre las pantallas del panel y los datos. Las páginas no importan `@inttimo/database` directamente.

```text
server/admin/
├── contract.ts      tipos que consumen las pantallas (Alan lee solo esto)
├── next-step.ts     función pura: pedido → siguiente paso
├── incidents.ts     función pura: pedido + eventos → incidencias
├── inbox.ts         getInbox()
├── orders.ts        searchOrders(), getOrderDetail()
└── notes.ts         addOrderNote(), listOrderNotes()
```

Las acciones de servidor viven junto a las páginas (`app/panel/(app)/pedidos/[id]/actions.ts`), validan con Zod, comprueban la sesión con `getAdminState()` y registran con `audit()`.

### 2.1 `nextStep`

| Condición (en orden) | `nextStep` |
|---|---|
| Pago distinto de `paid` / `partially_refunded` | `not_paid` |
| Envío · `pending` · sin `trackingNumber` | `generate_label` |
| Envío · `pending` · con `trackingNumber` | `hand_to_carrier` |
| Envío · `shipped` | `mark_delivered` |
| Recolección · `pending` | `notify_ready` |
| Recolección · `ready_for_pickup` | `mark_picked_up` |
| `delivered` | `none` |

`generate_label` incluye `blocked: "missing_address"` cuando el pedido de envío no tiene `deliveryAddress`.

### 2.2 Incidencias

Se calculan; no se guardan. Una incidencia desaparece cuando un evento posterior la resuelve.

| Tipo | Regla | Se resuelve con |
|---|---|---|
| `label_failed` | Último evento de guía = `LABEL_FAILED` | `LABEL_CREATED` posterior |
| `confirmation_email_failed` | Pagado y `confirmationEmailSentAt` nulo, con más de 15 min desde el pago | Correo enviado |
| `fulfillment_email_failed` | Último correo de entrega = `FULFILLMENT_EMAIL_FAILED` | `FULFILLMENT_EMAIL_SENT` posterior |
| `bonus_failed` | Último evento de bonus = `BONUS_FAILED` y `bonusSentAt` nulo | `BONUS_SENT` |
| `payment_unsettled` | `pending_payment`/`processing` con sesión de Stripe, más de 24 h | Reconciliación o webhook |
| `missing_address` | Envío pagado y sin `deliveryAddress` | Dirección capturada |

### 2.3 `getInbox()`

```ts
type Inbox = {
  toLabel: OrderSummary[];        // nextStep = generate_label
  toHandOver: OrderSummary[];     // nextStep = hand_to_carrier
  toNotify: OrderSummary[];       // nextStep = notify_ready
  awaitingPickup: (OrderSummary & { waitingDays: number })[]; // mark_picked_up; días desde fulfilledAt
  incidents: (OrderSummary & { incident: IncidentType })[];
};
```

Todas las listas van ordenadas de la más antigua a la más nueva y abarcan todas las preventas.

### 2.4 `searchOrders()`

```ts
searchOrders({
  q?: string;                 // nombre, correo, folio, teléfono, número de guía
  tab?: "to_prepare" | "in_transit" | "delivered" | "canceled" | "all";
  deliveryMethod?: "shipping" | "pickup";
  campaignId?: string;
  page: number;               // 50 por página
}): Promise<{ rows: OrderSummary[]; total: number; counts: Record<Tab, number> }>
```

Pestañas:
- `to_prepare` = pagado y `pending`;
- `in_transit` = `shipped` o `ready_for_pickup`;
- `delivered` = `delivered`;
- `canceled` = `refunded`, `canceled`, `expired` o `payment_failed`.

La consulta nueva va en `packages/database` (`searchAllReservations`) y no reemplaza a `searchReservations`, que usa la exportación.

### 2.5 `getOrderDetail(id)`

Devuelve un solo objeto, con cada dato una sola vez:

```ts
type OrderDetail = {
  id; code; campaign: { slug; productName };
  customer: { fullName; email; phone };
  payment: { status; quantity; unitAmount; shippingAmount; totalAmount; amountRefunded; currency; paidAt; stripeUrl };
  delivery: { method; status; pickupPoint?; address?; selection?; carrier?; trackingNumber?; trackingUrl?; labelUrl?; fulfilledAt?; deliveredAt? };
  bonus: { configured: boolean; sentAt: Date | null };
  nextStep: NextStep;
  incidents: IncidentType[];
  answers: { label: string; value: string }[];          // al comprar
  postPurchase: { label: string; value: string }[] | null;
  notes: { id; body; author; createdAt }[];
  timeline: { at: Date; label: string; failed: boolean }[];
};
```

### 2.6 Acciones

| Acción | Nueva | Efecto |
|---|:-:|---|
| `createLabel` | cambia | Ver §1: ya no marca ENVIADO |
| `handToCarrier` | ✅ | ENVIADO + correo + bonus |
| `updateDelivery` | — | Listo para recoger, entregado y guía hecha por fuera (sin cambios) |
| `retryBonus` | — | Sin cambios |
| `addNote` | ✅ | Nota interna (1–2000 caracteres) |
| `resendEmail(kind)` | ✅ | `confirmation` reenvía el correo de pago confirmado. `fulfillment` reenvía el aviso de enviado o listo **sin bonus** (el bonus tiene su propio reintento). Registra un evento y una auditoría. |

## 3. Datos

Una sola migración:

```text
presale_order_notes
  id           uuid pk
  reservationId uuid fk → presale_reservations (restrict)
  body         text not null (1–2000)
  authorEmail  text not null
  createdAt    timestamptz
  index (reservationId, createdAt)
```

La tabla es append-only (sin update ni delete en el código), con RLS activado y sin privilegios para `anon`/`authenticated`. El test de RLS existente la cubre al agregarla.

## 4. Pantallas base

| Ruta | Contenido |
|---|---|
| `/panel` | **Por hacer**: los 5 bloques de `getInbox()`, con contador y botón por fila |
| `/panel/pedidos` | Pestañas con contador, búsqueda, filtro por entrega, tabla (tarjetas en móvil) y exportar |
| `/panel/pedidos/[id]` | Encabezado → **Siguiente paso** → Cliente y entrega → Pago → Respuestas → Notas → Historial |
| `/panel/preventa` | Métricas de la preventa activa y enlace a editar (lo que hoy está en `/panel/campanas/[slug]`, sin la tabla) |
| `/panel/ajustes` | Enlace a Actividad (y más adelante a usuarios) |
| `/panel/reservas/[id]` | Redirección 308 a `/panel/pedidos/[id]` |
| `/panel/campanas/[slug]` | Redirección a `/panel/pedidos?campana=<id>` |

Menú: **Por hacer · Pedidos · Preventa · Ajustes**.

Las pantallas reutilizan los componentes de UI del #18 y no tienen lógica: muestran lo que entrega el contrato.

## 5. Fuera de alcance

Reembolsos y cancelación (subproyecto 2), Resumen con gráficas, usuarios desde el panel, salud del sistema y todo lo de la tienda.

## 6. Pruebas

- `next-step.test.ts` y `incidents.test.ts`: tablas de casos para cada fila de §2.1 y §2.2.
- `fulfillment.test.ts`: `createLabel` deja el pedido en `pending`, no envía correo ni reclama el bonus. `handToCarrier` marca ENVIADO y manda el correo con bonus una sola vez; un segundo intento falla con "ya cambió de estado".
- `packages/database/tests`: `searchAllReservations` (búsqueda por teléfono y guía, pestañas, conteos), notas y RLS de `presale_order_notes`.
- `pnpm lint && pnpm typecheck && pnpm test` y revisión manual a 390 y 1280 px con datos locales.

## 7. Entrega

- Rama `feat/panel-por-hacer` desde `main`, después de mergear el #18. Un PR.
- `docs/panel-admin/CONTRATO.md` para Alan: tipos de `contract.ts`, acciones y qué archivos puede tocar (`app/panel/**` para presentación; `server/admin/**` no).
- Actualizar `docs/frontend.md`: ahora Alan sí puede rediseñar las pantallas del panel.
- **Antes de desplegar:** revisar en producción si algún pedido recibió el correo "va en camino" al generar la guía, sin haberse entregado a la paquetería.
