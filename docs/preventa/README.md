# Preventa — backend

Reserva de lugar en la preventa de UNO+UNO: contador de 14 días, cuestionario y pago del **precio completo** con Stripe Checkout. Sin límite de lugares.

El backend está terminado; la UI la construye frontend. Este documento es el contrato entre ambos.

## Flujo

```text
Página /preventa/[slug]
  GET  /api/preventa/[slug]                 → datos, contador, preguntas
  POST /api/preventa/[slug]/reservas        → { checkoutUrl }  → window.location = checkoutUrl
        (Stripe Checkout: pago + dirección de envío en México)
  Stripe regresa a /preventa/[slug]/confirmacion?session_id=cs_...
  GET  /api/preventa/[slug]/confirmacion?session_id=...   → estado (pagada, procesando, …)
  Si cancela en Stripe regresa a /preventa/[slug]?cancelado=1
```

Las dos páginas (`/preventa/[slug]` y `/preventa/[slug]/confirmacion`) ya existen como **placeholder funcional** para rediseñar libremente. Las URLs de regreso de Stripe apuntan ahí, así que conservar esas rutas.

| Archivo | Qué es |
|---|---|
| `apps/inttimo/src/app/preventa/[slug]/page.tsx` | Página de preventa (Server Component: lee la campaña directo de la base) |
| `apps/inttimo/src/app/preventa/[slug]/confirmacion/page.tsx` | Página de regreso de Stripe |
| `apps/inttimo/src/components/presale/Countdown.tsx` | Contador (corrige el reloj del cliente con `serverTime`) |
| `apps/inttimo/src/components/presale/ReservationForm.tsx` | Formulario + cuestionario dinámico, errores por campo, honeypot, `Idempotency-Key` |
| `apps/inttimo/src/components/presale/ConfirmationStatus.tsx` | Estado de la reserva con reintentos |
| `apps/inttimo/src/app/globals.css` | Tokens de color/tipografía provisionales |

La lógica de esos componentes (llamadas a la API, manejo de errores, accesibilidad) ya funciona; lo pendiente es diseño, fotografía, tipografías finales y el enlace a los términos (marcado `PLACEHOLDER`).

Tipos TypeScript de todas las respuestas: [`apps/inttimo/src/server/presale/contract.ts`](../../apps/inttimo/src/server/presale/contract.ts). En Server Components se puede llamar directo a `getPublicCampaign` (ver `reservations.ts`) sin hacer fetch a la propia API.

**Montos siempre en centavos** (`99900` = $999.00 MXN). Formatear con `Intl.NumberFormat("es-MX", { style: "currency", currency })` y `amount / 100`.

## `GET /api/preventa/[slug]`

```json
{
  "slug": "uno-mas-uno",
  "productName": "UNO+UNO",
  "unitAmount": 99900,
  "currency": "mxn",
  "maxQuantityPerReservation": 1,
  "startsAt": "2026-10-01T16:00:00.000Z",
  "endsAt": "2026-10-15T16:00:00.000Z",
  "serverTime": "2026-10-05T12:00:00.000Z",
  "phase": "open",
  "questions": [ { "id": "...", "label": "...", "type": "select", "required": true, "options": [{ "value": "...", "label": "..." }] } ],
  "deliveryNote": null,
  "terms": { "version": 1, "content": "Texto de los términos…" }
}
```

- **Contador**: corre hasta `endsAt`. Corregir el reloj del navegador con `serverTime` (`offset = serverTime - Date.now()` al cargar). Si `phase` es `upcoming`, contar hasta `startsAt`.
- `phase`: `upcoming` (aún no abre), `open`, `closed`. Solo en `open` se aceptan reservas.
- `questions`: renderizar el formulario **a partir de estos datos**; no hardcodear preguntas.

| `type` | Control | Valor a enviar |
|---|---|---|
| `text` | input | string (máx. `maxLength` o 200) |
| `textarea` | textarea | string (máx. `maxLength` o 2000) |
| `select` | radios / select | `value` de una opción |
| `multiselect` | checkboxes | array de `value` |
| `boolean` | checkbox | `true` / `false` (si `required`, debe ser `true`) |

- `deliveryNote`: texto aprobado sobre la entrega; mostrarlo solo si no es `null`.
- `terms`: términos vigentes. Mostrarlos (o enlazarlos) junto a la casilla de aceptación y enviar `termsVersion: terms.version`. Si es `null`, la preventa aún no acepta reservas: no mostrar el formulario.
- 404 si no existe o está en borrador.

## `POST /api/preventa/[slug]/reservas`

Cabeceras: `Content-Type: application/json` y **`Idempotency-Key`** (recomendado: un UUID generado al montar el formulario; 8–100 caracteres). Con la misma clave, un doble clic devuelve la misma sesión de pago en lugar de crear otra.

```json
{
  "fullName": "Nombre Apellido",
  "email": "correo@dominio.com",
  "phone": "+52 55 1234 5678",
  "quantity": 1,
  "answers": { "id_pregunta": "valor" },
  "acceptTerms": true,
  "termsVersion": 1,
  "marketingConsent": false,
  "website": "",
  "attribution": { "utm_source": "instagram" }
}
```

- `phone`, `quantity` (default 1), `marketingConsent` (default false) y `attribution` son opcionales.
- `website` es un **honeypot**: input oculto con CSS (no `type="hidden"`), `tabindex="-1"`, `autocomplete="off"`. Debe llegar vacío.
- El precio **no** se envía: siempre sale de la base de datos.

**201** → `{ "reservationCode": "PV-7K2M9QX4TB", "checkoutUrl": "https://checkout.stripe.com/...", "checkoutExpiresAt": "..." }`. Redirigir con `window.location.assign(checkoutUrl)`. La sesión de pago dura 60 min.

**Errores** (todos con la forma `{ "error": { "code", "message", "fieldErrors"? } }`):

| Status | `code` | Qué mostrar |
|---|---|---|
| 400 | `validation_error` | `fieldErrors` por campo: `fullName`, `email`, `phone`, `quantity`, `acceptTerms`, `answers.<id>` |
| 404 | `not_found` | Preventa no existe |
| 409 | `presale_not_open` | `error.phase` = `upcoming` o `closed` |
| 409 | `idempotency_conflict` | Pedir recargar la página |
| 409 | `terms_outdated` | Los términos cambiaron: recargar la campaña, mostrarlos y pedir aceptarlos de nuevo |
| 503 | `presale_not_ready` | La campaña no tiene términos publicados |
| 429 | `rate_limited` | Esperar unos minutos |
| 503 | `payment_unavailable` / `service_unavailable` | Reintentar más tarde (nunca mostrar como éxito) |

## `GET /api/preventa/[slug]/confirmacion?session_id=cs_...`

```json
{ "reservationCode": "PV-7K2M9QX4TB", "status": "paid", "productName": "UNO+UNO", "quantity": 1, "totalAmount": 99900, "currency": "mxn", "email": "c***@gmail.com", "paidAt": "..." }
```

| `status` | Mensaje sugerido |
|---|---|
| `paid` | Lugar confirmado. Llegará un correo con el folio. |
| `processing` | Pago en efectivo/OXXO pendiente: se confirma cuando se pague la ficha. |
| `pending_payment` | Confirmando el pago… **reintentar cada 3 s, máximo ~30 s**. |
| `payment_failed`, `expired`, `canceled` | El pago no se completó; ofrecer volver a reservar. |
| `refunded` | Reserva reembolsada. |

El endpoint consulta a Stripe directamente si la reserva sigue pendiente, así que normalmente ya responde `paid` en la primera llamada.

## Operación

Producción y despliegue: ver [`docs/deploy.md`](../deploy.md). Administración diaria: **panel** en `/panel` (reservas, búsqueda, detalle, edición de campaña y términos, CSV, bitácora).

### Primera vez (local)

```bash
cp .env.example .env                  # SUPABASE_SECRET_KEY: el que imprime `supabase start`
pnpm install
pnpm supabase:start                   # Supabase local (puertos 55321–55329)
pnpm db:migrate
pnpm admin --create --email=tu@correo.com
pnpm presale:upsert --file=ruta/campana.json --terms=ruta/terminos.md --dry-run   # valida
pnpm presale:upsert --file=ruta/campana.json --terms=ruta/terminos.md             # guarda
pnpm dev                              # http://localhost:3100 · panel en /panel
stripe listen --forward-to localhost:3100/api/webhooks/stripe   # copia el whsec_… a STRIPE_WEBHOOK_SECRET
```

Pagos de prueba: tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC.

### Crear / editar la campaña

Copiar [`campaign.example.json`](./campaign.example.json) y completar. La plantilla trae `unitAmount` y `startsAt` en `null` **a propósito**: no se puede cargar sin el precio y la fecha aprobados.

- `startsAt` en ISO 8601 con zona horaria: `2026-10-01T10:00:00-06:00`.
- Cierre = `startsAt` + `durationDays` (14). O indicar `endsAt` explícito.
- `unitAmount` en centavos, IVA incluido o no según defina el negocio (se cobra exactamente ese monto).
- `status`: `draft` (invisible) → `active` → `closed` (cierra antes de tiempo).
- Cambiar el precio con reservas existentes exige `--force` en la CLI o confirmar en el panel (las reservas ya creadas conservan su precio).
- Una campaña `active` exige términos publicados (`--terms=archivo.md` o desde el panel). Cada publicación es una versión nueva e inmutable; cada reserva guarda la versión que aceptó.
- No cambiar el `id` de una pregunta con reservas existentes: es la clave de las respuestas.

### Stripe (dashboard)

1. Webhook → endpoint `https://<dominio>/api/webhooks/stripe` con eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
2. Métodos de pago: se toman de la configuración del dashboard (tarjeta; OXXO si se activa — queda como `processing` hasta que se paga la ficha).
3. Reembolsos: hacerlos desde el dashboard de Stripe; el webhook actualiza la reserva.

### Día a día

```bash
pnpm presale:export --slug=uno-mas-uno > reservas.csv                      # todas
pnpm presale:export --slug=uno-mas-uno --status=paid,processing > pagadas.csv
pnpm presale:reconcile                                                      # si un webhook falló
```

`presale:reconcile` consulta a Stripe las reservas sin resolver (>15 min) y reintenta los correos de confirmación pendientes. Conviene correrlo tras cualquier incidente con webhooks.

### Garantías

- Un pago = una reserva pagada: los eventos de Stripe se registran por id (duplicados se ignoran) y cada cambio de estado es condicional en SQL.
- Eventos fuera de orden no degradan una reserva pagada. Si llega un pago sobre una reserva expirada, el pago gana.
- Cada reserva tiene timeline append-only (`presale_reservation_events`), bloqueado contra UPDATE/DELETE en la base.
- El correo de confirmación se envía una sola vez; si falla, se reintenta.
- Si Stripe o la base fallan, la API responde 503; nunca simula éxito.
