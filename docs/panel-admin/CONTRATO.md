# Contrato del panel — para el frontend

El backend del panel vive en `apps/inttimo/src/server/admin/`. Las pantallas en `apps/inttimo/src/app/panel/**` solo muestran lo que este contrato entrega: no consultan la base ni deciden reglas.

## Qué puedes tocar

- **Sí:** `src/app/panel/**/page.tsx`, `DeliveryForms.tsx`, `PanelNav.tsx`, `ui.tsx` y `layout.tsx` (presentación, textos, orden, estilos).
- **No, sin coordinar:** `src/server/**`, los archivos `actions.ts` y `packages/**`. Si necesitas un dato que el contrato no trae, pídelo.

## Tipos

Todos están en `src/server/admin/contract.ts` (se pueden importar desde componentes de cliente).

| Tipo | Qué es |
|---|---|
| `Inbox` | Bandeja "Por hacer": `toLabel`, `toHandOver`, `toNotify`, `awaitingPickup` (con `waitingDays`) e `incidents` (con `incident`) |
| `OrderList` | Lista de pedidos: `rows`, `total`, `counts` por pestaña, `page`, `pages`, `campaigns` |
| `OrderDetail` | Detalle de un pedido; cada dato aparece una sola vez |
| `NextStep` | El único paso que toca. La pantalla muestra el botón según `nextStep.type` |
| `IncidentType` + `INCIDENT_LABELS` | Problemas abiertos y su texto |
| `ORDER_TABS` + `ORDER_TAB_LABELS` | Pestañas de la lista |

## Consultas

| Función | Archivo | Uso |
|---|---|---|
| `getInbox(db)` | `inbox.ts` | `/panel` |
| `parseOrderQuery(searchParams)` + `searchOrders(db, query)` | `orders.ts` | `/panel/pedidos` (URL: `tab`, `q`, `entrega`, `campana`, `pagina`) |
| `getOrderDetail(db, id)` | `orders.ts` | `/panel/pedidos/[id]` |

## Siguiente paso → botón

| `nextStep.type` | Qué mostrar | Acción |
|---|---|---|
| `generate_label` | "Generar guía" (o "Revisar si la guía ya está lista" si `inProgress`); si `blocked`, pedir dirección | `createLabel` |
| `hand_to_carrier` | "Imprimir guía" (`delivery.labelUrl`) + "Entregué el paquete a la paquetería" | `handToCarrierAction` |
| `mark_delivered` | "Marcar como ENTREGADO" | `updateDelivery` con `type=delivered` |
| `notify_ready` | Formulario con nota + "Marcar LISTO PARA RECOGER y avisar" | `updateDelivery` con `type=ready_for_pickup` |
| `mark_picked_up` | "Marcar como ENTREGADO" | `updateDelivery` con `type=delivered` |
| `none` / `not_paid` | Solo texto | — |

## Acciones (en `app/panel/(app)/pedidos/[id]/actions.ts`)

Todas devuelven `{ ok?: string; error?: string }` para mostrar con `<Alert>`.

| Acción | Para qué |
|---|---|
| `createLabel(id)` | Compra la guía en SkyDropX. No avisa al cliente |
| `handToCarrierAction(id)` | Marca ENVIADO, manda guía y bonus |
| `updateDelivery(id, state, form)` | Listo para recoger, entregado o guía hecha por fuera |
| `retryBonus(id)` | Reintenta el bonus |
| `addNote(id, state, form)` | Nota interna (`body`, máximo 2000) |
| `resendEmail(id, "confirmation" \| "fulfillment")` | Reenvía la confirmación de pago o el aviso de envío/recolección (sin bonus) |
