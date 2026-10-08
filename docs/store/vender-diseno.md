# Tienda inttimo — PR A "Vender": diseño

- **Estado:** propuesta para aprobación (2026-10-08)
- **Rama:** `feat/tienda-vender` (ya contiene la capa de base de datos de la tienda, migraciones 0010–0011)
- **Cubre:** subproyectos 2, 3 y 4 de [BACKEND-PLAN.md](./BACKEND-PLAN.md)
- **Plan de implementación:** [vender-plan.md](./vender-plan.md)

## Objetivo

Hacer real la compra pública de la tienda implementando exactamente lo que llama el adaptador HTTP del frontend (`apps/inttimo/src/lib/store/http.ts` → `contract.ts`), sin tocar sus pantallas:

| Método `StoreApi` | Ruta | Servicio |
|---|---|---|
| `catalog` | `GET /api/tienda/productos` | `server/store/catalog.ts` → `getCatalog` |
| `product` | `GET /api/tienda/productos/[slug]` | `catalog.ts` → `getProduct` |
| `quoteCart` | `POST /api/tienda/carrito/cotizar` | `catalog.ts` → `quoteCart` |
| `deliveryOptions` | `GET /api/tienda/entrega` | `server/store/shipping.ts` → `getDeliveryOptions` |
| `quoteShipping` | `POST /api/tienda/envio/cotizar` | `shipping.ts` → `quoteStoreShipping` |
| `lookupPostalCode` | `GET /api/tienda/codigo-postal/[cp]` | `server/store/postal-code.ts` |
| `checkout` | `POST /api/tienda/checkout` (`Idempotency-Key`) | `server/store/checkout.ts` → `createStoreCheckout` |
| `orderConfirmation` | `GET /api/tienda/pedido/confirmacion?session_id=…` | `server/store/confirmation.ts` |

Más: rama de la tienda en el webhook de Stripe existente, correos de pedido pagado y `pnpm store:reconcile`.

**Fuera de alcance:** panel `/api/panel/tienda/*` y reembolsos iniciados desde el panel (PR B); rastreo, cuenta, contacto, iglesias y newsletter (PR C). `contract.ts`, `mock.ts`, `http.ts`, `api.ts` y `flags.ts` **no cambian**.

## Arquitectura

```text
apps/inttimo/src/
├── app/api/tienda/…/route.ts        rutas delgadas: storeRoute(…) → servicio → storeResponse(…)
├── content/store-products.ts        NUEVO: textos e imágenes de producto de la tienda (por slug)
└── server/
    ├── presale/gateway.ts           ÚNICO que importa Stripe: + createStoreCheckout, expireCheckout, snapshot.kind
    ├── presale/webhook.ts           mismo endpoint: enruta eventos de la tienda a server/store/settlement.ts
    ├── presale/runtime.ts           + getPaymentGateway(); lazyGateway con los métodos nuevos
    └── store/                       NUEVO (espejo de server/presale)
        ├── common.ts                StoreDeps, StoreResult, ok/fail, zodFieldErrors, hash
        ├── http.ts                  storeRoute (404 si la tienda está oculta, 503 en errores), storeResponse, readJson
        ├── runtime.ts               getStoreDeps(), confirmStorePaid() (server-only)
        ├── lines.ts                 esquema de líneas del carrito, normalizeLines, sameLines
        ├── terms.ts                 STORE_TERMS_VERSION = 1
        ├── catalog.ts               catálogo, detalle, cotización del carrito (solo lectura)
        ├── shipping.ts              entrega, paquete del carrito, cotización SkyDropX, validación de la tarifa elegida
        ├── postal-code.ts           sin proveedor: siempre 404 (un solo archivo para conectar SEPOMEX después)
        ├── checkout.ts              crea pedido + sesión de Stripe, idempotencia, límites
        ├── settlement.ts            aplica el estado de Stripe al pedido (webhook, confirmación, reconciliación)
        ├── notifications.ts         correo al cliente (una vez) y aviso al equipo
        ├── order-view.ts            StoreOrder → OrderView del contrato
        ├── confirmation.ts          GET confirmación: sincroniza con Stripe y arma OrderView
        └── reconcile.ts             red de seguridad (pnpm store:reconcile)
packages/database/
├── src/schema/store.ts              + store_settings, store_shipping_quotes, store_orders.confirmation_email_sent_at
├── src/store.ts                     + configuración, cotizaciones, disponibilidad sin escribir, liberación endurecida,
│                                      vencimiento/excepción/reembolso, búsquedas, reserva del correo
└── migrations/0012_store_sell.sql   generada + RLS y REVOKE a mano
```

Convenciones iguales a la preventa: montos en centavos, errores `{ error: { code, message, fieldErrors? } }`, `cache-control: no-store`, logs JSON estructurados, límites de intentos en `rate_limits`, precios siempre de la base. Dentro de `server/store` las importaciones son relativas con `.ts` (los scripts corren con `node --experimental-strip-types`).

## Visibilidad: las rutas de la API también dan 404 con la tienda oculta

**Decisión:** todas las rutas `/api/tienda/*` pasan por `storeRoute`, que responde `404 not_found` si `storeEnabled` (de `src/lib/store/flags.ts`) es falso. Así nada de la tienda es alcanzable en producción antes del lanzamiento: ni el catálogo, ni el checkout (que crearía pedidos y sesiones de Stripe reales), aunque alguien conozca la URL. En desarrollo local (`next dev`) `storeEnabled` ya es verdadero. **Los previews de Vercel no:** se construyen con `NODE_ENV=production`, así que la tienda sigue oculta en un Preview salvo que ese entorno tenga `NEXT_PUBLIC_STORE_ENABLED=1` (el comentario de `src/lib/store/flags.ts` que dice "previews" está desactualizado). Nunca poner `NEXT_PUBLIC_STORE_ENABLED=1` en un Preview que use las llaves de Stripe en modo live: cualquiera con la URL del preview podría crear pedidos y cobros reales.

El **webhook no se oculta**: es el mismo endpoint de la preventa y, si la tienda se vuelve a ocultar con pedidos vivos, sus pagos y reembolsos deben seguir registrándose.

## Datos nuevos (migración 0012)

| Cambio | Contenido | Por qué |
|---|---|---|
| `store_settings` (una fila, `id = 'default'`, `CHECK`) | `pickup_enabled`, `pickup_points` (jsonb `PickupPoint[]`), `shipping_enabled`, `shipping_profile` (jsonb `ShippingProfile`: origen, paquete por unidad, paqueterías permitidas, carta porte, tipo de empaque) | Decisión 5. Lo administrará el panel; hoy lo siembra `pnpm store:seed` **copiando** `docs/preventa/uno-mas-uno.json` (nada inventado). No pisa una fila existente. |
| `store_shipping_quotes` | `lines` (jsonb, normalizadas), `postal_code`, `quotation_id`, `currency`, `options` (jsonb con precio en centavos), `expires_at` | **Nueva decisión:** `presale_shipping_quotes.campaign_id` es obligatorio y apunta a campañas; la tienda cotiza por carrito. El cobro de envío sale de aquí, nunca del navegador. |
| `store_orders.confirmation_email_sent_at` | reserva idempotente del correo | Decisión 13 (igual que la preventa). |

Ambas tablas nuevas: RLS activo y `REVOKE ALL` a `anon`/`authenticated` (la prueba existente "todas las tablas de public tienen RLS activo" las cubre). Tras desplegar, la verificación de `BACKEND-PLAN.md` pasa a contar 9 tablas `store_%`.

## Flujo por endpoint

### Catálogo y detalle (solo lectura)

1. `listStoreProducts(publishedOnly)` + `getExpiredHeldUnits` (una consulta agregada).
2. Disponible efectivo = `on_hand − reserved + unidades de pedidos pendientes ya vencidos` (misma regla que la liberación). **No escribe** (decisión 7).
3. Producto publicado **sin entrada en `content/store-products.ts`** → no aparece y su detalle da 404 (log `store_product_without_content`). **Nueva decisión:** sin texto e imagen la pantalla no puede pintarlo.
4. Estado (decisión 6): `coming_soon` → `coming_soon`; `presale` → `presale`; `on_sale` con 0 → `sold_out`; ≤ `low_stock_threshold` → `low_stock`; si no `available`. `availableUnits` solo con `low_stock`. `price: null` se expone tal cual (no comprable).
5. Detalle: `description`, `gallery`, `includes`, `howToPlay`, `faqs`, `seo` del archivo de contenido; `maxQuantityPerOrder` de la base; `related` = otros productos publicados (hasta 3).

`content/store-products.ts` reutiliza los textos e imágenes de `content/products.ts` (pendientes de aprobación). **Nuevas decisiones:** la galería **no** incluye la imagen del bonus (es exclusivo de la preventa); "Cómo se juega" se copia del simulador marcado como pendiente de Karina; `mock.ts` no se toca (queda duplicado a propósito).

### Cotizar carrito

Valida `{ lines ≤ 50, couponCode? }`, une líneas repetidas y por cada una:

| Caso | Resultado |
|---|---|
| id desconocido, oculto o sin contenido | se omite (no hay nombre ni imagen que mostrar; igual que el simulador). El checkout lo rechaza. |
| `price null` o `coming_soon` | `available: false`, subtotal 0, aviso "Este producto todavía no está a la venta." |
| disponible efectivo 0 | `available: false`, subtotal 0, aviso "Este producto se agotó." |
| cantidad > máximo por pedido | se ajusta, aviso "Máximo N por pedido." |
| cantidad > disponible | se ajusta, aviso "Solo quedan N unidades; ajustamos la cantidad." |

Total = suma de líneas disponibles. Cupones (decisión 9): no hay módulo; cualquier `couponCode` → `couponError: "Este cupón no es válido."`, sin descuento.

### Entrega y envío

- `GET /entrega`: puntos y `pickup.enabled` de `store_settings`; `shipping.enabled` = configuración activa **y** perfil **y** credenciales de SkyDropX; `termsVersion = STORE_TERMS_VERSION` (constante en `server/store/terms.ts`, hoy 1: los términos aprobados el 30-sep).
- `POST /envio/cotizar`: reutiliza de la preventa `areaSchema`, `pickOptions` (económica + express) y el mismo `ShippingProvider`. Límite 20 cotizaciones / 10 min por IP. Guarda la cotización 120 min.
- **Paquete del carrito** (decisión 10): por unidad se usa peso y medidas del producto; si le falta alguno, el paquete por unidad de `store_settings`. Se suman pesos, se apilan alturas y se toma el mayor largo y ancho. Es la regla `parcelFor` de la preventa, que ya funciona con SkyDropX en producción: para UNO+UNO da exactamente el mismo paquete y con varios productos sobrestima (nunca se cobra de menos).
- `GET /codigo-postal/[cp]`: sin proveedor SEPOMEX → `404 not_found` siempre (el checkout ya deja escribir a mano); `400` si no son 5 dígitos.

### Checkout (`POST /checkout`)

Orden (cada paso puede cortar con su error):

1. `siteUrl` configurada; `Idempotency-Key` con forma válida (8–100, `[\w-]`).
2. Zod del cuerpo. Las claves de `fieldErrors` son **las que pinta `CheckoutView`**: `fullName`, `email`, `phone`, `deliveryMethod`, `pickupPointId`, `address.<campo>`, `shipping`, `acceptTerms`, `lines`, `couponCode`.
3. Campo trampa `website`; cupón → 422; versión de términos → 409 `terms_outdated`.
4. Cada línea apunta a un producto publicado **con contenido** (si no, 409 `out_of_stock`).
5. Entrega: recolección exige configuración activa y un punto existente; envío exige envío disponible y una cotización vigente cuyo `postalCode` y líneas normalizadas coincidan, y un `rateId` de esa cotización. El costo sale de la cotización guardada.
6. Repetición con la misma clave: si el pedido sigue `pending` con sesión vigente → misma `checkoutUrl` (200); si no → 409.
7. Límites: 10 / 10 min por IP y 5 / 10 min por correo.
8. `createStoreOrder` (precios de la base, apartado sin sobreventa). Si falta stock y había apartados vencidos sin liberar, **libera en bloque (100) y reintenta una vez** (nueva decisión: la ruta caliente solo libera 10).
9. `gateway.createStoreCheckout`: una línea por producto con nombre y precio copiados al pedido, envío como `shipping_option` de monto fijo, moneda del pedido, `metadata { kind: "store", orderId, orderNumber, deliveryMethod }`, `client_reference_id = orderId`, `success_url = {sitio}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}` (lo que lee la página de confirmación), `cancel_url = {sitio}/checkout?pago=cancelado`, llave de idempotencia de Stripe `store-checkout-{orderId}`.
10. Vigencia de la sesión: **31 minutos** (nueva decisión: Stripe exige al menos 30 contados desde que *él* crea la sesión; con 30 exactos la latencia la deja por debajo). La liberación espera además los 5 min de gracia.
11. Stripe falla → `markStoreCheckoutCreateFailed` (libera) + 503. Si `attachStoreCheckoutSession` devuelve null (el pedido se cerró en paralelo) → se expira la sesión en Stripe + 503 (nota de BACKEND-PLAN).
12. 201 `{ orderNumber, checkoutUrl, checkoutExpiresAt }`.

### Confirmación (`GET /pedido/confirmacion?session_id=…`)

`session_id` con forma `cs_…`; pedido por sesión (404 si no existe). Si sigue `pending`, consulta la sesión a Stripe por el gateway y aplica **la misma liquidación que el webhook** (`applyStoreSettlement`); nunca marca pagado solo porque el navegador volvió. Si Stripe no responde, muestra el último estado conocido. Si quedó pagado sin correo, dispara `onPaid`. `OrderView`: correo enmascarado (`a***@dominio`), líneas con imagen del archivo de contenido, punto de recolección de `store_settings`, dirección resumida, `shipment` solo si hay guía, y **solo eventos reales** de `store_order_events` (`PAYMENT_APPROVED` → "Pedido confirmado", y los logísticos que agregue el panel).

## Webhook: mismo endpoint, enrutado

`snapshotFromSession` agrega `kind` (`"store"` solo si `metadata.kind === "store"`; cualquier otra sesión, incluidas las vivas de la preventa que no traen `kind`, sigue siendo `"presale"`) y `storeOrderId` (`client_reference_id` o `metadata.orderId`). `reservationId` solo se llena en sesiones de preventa.

| Evento | Preventa | Tienda |
|---|---|---|
| `checkout.session.completed` / `async_payment_succeeded` | sin cambios | monto y moneda iguales al pedido → `markStoreOrderPaid`; distintos → **no** se marca pagado: `markStoreOrderPaymentMismatch` + log `store_amount_mismatch` |
| `checkout.session.expired` | sin cambios | `markStoreCheckoutExpired` (cancela y libera una vez) |
| `checkout.session.async_payment_failed` | sin cambios | `markStoreOrderPaymentFailed` |
| `charge.refunded` | por payment intent en reservas | si no es reserva, por payment intent en `store_orders` → `applyStoreRefund` (`refunded` / `partially_refunded` + `amount_refunded`) |

- Resolución del pedido: por id de sesión; si no, por `storeOrderId` solo si el pedido aún no tiene otra sesión (el webhook puede llegar antes de ligarla).
- Idempotencia: el mismo `claimStripeEvent` en la misma transacción; las funciones de la tienda abren transacciones anidadas (savepoints) dentro de ella. Un fallo revierte todo y Stripe reintenta.
- El endpoint manda la confirmación de preventa (`confirmPaid`) o de tienda (`confirmStorePaid`) según el resultado.
- **Reembolso y stock:** este PR solo registra el reembolso. Devolver piezas al inventario depende de si el pedido ya salió y es parte de PR B (cancelar/reembolsar desde el panel).
- **Nueva decisión — monto distinto:** el pedido queda `pending`, `fulfillment_status = exception`, con su apartado y el payment intent guardado; evento `EXCEPTION { reason: "amount_mismatch", expected, received }`. La liberación automática y el "disponible efectivo" **ignoran** pedidos en excepción, para que un cobro real nunca se cancele solo; lo resuelve una persona en el panel (PR B).

## Correos

`sendStoreConfirmationIfNeeded(db, orderId, { send, notifyEmail })`: reserva `confirmation_email_sent_at` (solo pedidos `paid`, una sola vez aunque lleguen webhook y confirmación en paralelo); si el envío falla, libera la reserva y anota `CONFIRMATION_EMAIL_FAILED` para que el webhook, la confirmación o `store:reconcile` reintenten.

- Cliente: folio, productos, subtotal, envío, total, entrega (punto o dirección), siguiente paso y canales de atención (`content/legal/business.ts`). Copia funcional en español **marcada en el código como pendiente de aprobación de Karina**; no promete envío ni guía.
- Equipo: `STORE_NOTIFY_EMAIL` (si falta, `PRESALE_NOTIFY_EMAIL`); un fallo solo se registra.
- **Nueva decisión — pagado sin stock** (`paid_oversold`, `fulfillment_status = exception`): no se manda al cliente un "pedido confirmado" que no se puede surtir; solo el aviso al equipo, marcado como incidencia. El cliente ve "Incidencia en la entrega" en la confirmación y el equipo lo contacta/reembolsa (PR B).

## Liberación de apartados endurecida (decisión 8)

- `closePendingOrder`: pre-chequeo sin bloqueo; si el pedido ya no está `pending` no toma candados de inventario.
- `releaseExpiredStoreOrders(db, now, { limit, source })`: candidatos por `coalesce(checkout_expires_at, created_at)` ascendente, excluye excepciones, `try/catch` por pedido con log `store_release_failed`.
- `createStoreOrder`: libera como máximo `STORE_CHECKOUT_RELEASE_LIMIT = 10` y nunca aborta la compra por un error de liberación (log `store_release_before_order_failed`).
- Liberación en bloque: reintento del checkout (100) y `pnpm store:reconcile` (1000).

## `pnpm store:reconcile`

1. Pedidos `pending` con sesión y más de 15 min (`--older-than=N`): consulta a Stripe y aplica `applyStoreSettlement` (origen `cli`).
2. Liberación en bloque de lo vencido.
3. Correos de pedidos pagados sin confirmación.

Sale con código 1 si hubo errores o correos fallidos (igual que `presale:reconcile`).

## Errores

| Situación | HTTP | `code` | `fieldErrors` |
|---|---|---|---|
| Tienda oculta (cualquier `/api/tienda/*`) | 404 | `not_found` | — |
| Cuerpo inválido | 400 | `validation_error` | claves del checkout / `postalCode`… / `lines` |
| Campo trampa lleno | 400 | `validation_error` | — |
| `Idempotency-Key` mal formada | 400 | `validation_error` | — |
| Cupón en el carrito | 200 | — | `couponError` en la respuesta |
| Cupón en el checkout | 422 | `validation_error` | `couponCode` |
| Términos de otra versión | 409 | `terms_outdated` | — |
| Recolección apagada / punto inexistente | 400 | `validation_error` | `deliveryMethod` / `pickupPointId` |
| Envío apagado (checkout) | 400 | `validation_error` | `deliveryMethod` |
| Envío apagado (cotizar) | 409 | `service_unavailable` | — |
| Cotización inexistente, vencida o de otro carrito | 409 | `quote_expired` | `shipping` |
| Cotización de otro código postal | 409 | `quote_expired` | `address.postalCode` |
| Tarifa que no está en la cotización | 400 | `validation_error` | `shipping` |
| SkyDropX sin tarifas para el destino | 422 | `validation_error` | — |
| SkyDropX no responde | 503 | `service_unavailable` | — |
| Producto oculto, sin precio, próximamente, sin contenido o inexistente | 409 | `out_of_stock` | `lines` |
| Stock insuficiente | 409 | `out_of_stock` | `lines` ("UNO+UNO: Solo quedan 2 unidades.") |
| Más del máximo por pedido (checkout) | 400 | `validation_error` | `lines` |
| Misma clave y la sesión ya no está vigente | 409 | `validation_error` | — |
| Demasiados intentos | 429 | `rate_limited` | — |
| Stripe no crea la sesión / no se pudo ligar | 503 | `service_unavailable` | — |
| Producto o pedido inexistente | 404 | `not_found` | — |
| `session_id` mal formado / CP que no son 5 dígitos | 400 | `validation_error` | — / `postalCode` |
| Código postal sin catálogo | 404 | `not_found` | — |
| Error inesperado (base caída, variable faltante) | 503 | `service_unavailable` | — |

**Nueva decisión:** el contrato no tiene `idempotency_conflict` ni `shipping_no_rates`; se usan `validation_error` (409/422) con un mensaje claro en vez de cambiar `contract.ts` (decisión 1: solo si es inevitable, y no lo es: la pantalla muestra `message`).

## Decisiones aprobadas que este diseño aplica

1–15 del encargo: contrato intacto; servicios en `server/store`; rutas ocultas con `flags.ts`; Stripe solo en `gateway.ts`; mismo webhook enrutado por `metadata.kind` / `client_reference_id` / payment intent; `store_settings` sembrada desde el JSON de la preventa; datos comerciales de la base y textos del contenido; lectura sin escrituras; liberación endurecida; carrito calculado en el servidor sin cupones; envío por carrito con la lógica de la preventa; código postal 404; checkout validado e idempotente; confirmación que sincroniza con Stripe; correos idempotentes; `store:reconcile`; pruebas con Vitest + PGlite + fakes, TDD por tarea, preventa en verde.

## Nuevas decisiones (resumen)

1. Tabla `store_shipping_quotes` (las cotizaciones de preventa dependen de una campaña).
2. Monto distinto → pendiente en excepción, con apartado, fuera de la liberación automática.
3. Pagado sin stock → sin correo al cliente; aviso de incidencia al equipo.
4. Sesión de Stripe de 31 min.
5. Ruta caliente libera 10; si falta stock, libera en bloque y reintenta una vez.
6. Sin códigos nuevos en el contrato (`validation_error` 409/422).
7. Productos sin contenido: fuera del catálogo y rechazados en el checkout; galería sin la imagen del bonus; "Cómo se juega" copiado del simulador como pendiente.
8. Ids desconocidos del carrito se omiten en la cotización.
9. Regla del paquete del carrito (suma de pesos, alturas apiladas, mayor largo/ancho; respaldo por unidad de la configuración).
10. El webhook no se oculta con la tienda.
11. `cancel_url = /checkout?pago=cancelado`.

## Pendientes que no resuelve este PR

- **Métodos de pago asíncronos (OXXO):** se respetan los métodos activos en el Dashboard de Stripe (igual que la preventa; no se inventa una política). Un pago asíncrono que llega después de los 36 min cae en la ruta de pago tardío (vende si hay stock; si no, excepción). Decidir con el usuario si la tienda limita a tarjeta (`payment_method_types: ["card"]`, un cambio de una línea en `gateway.ts`).
- **Frontend (colaborador):** en modo `http` el carrito no se vacía después de pagar (`CheckoutView` solo llama `clear()` en modo `mock`); `OrderSteps` marca "Pedido confirmado" aunque el pago siga pendiente (`fulfillmentStatus` vale `confirmed` desde el inicio).
- Negocio (no inventar): precio de tienda, Términos propios de la tienda (subir `STORE_TERMS_VERSION`), aprobación de la copia de los correos, textos y fotos oficiales.
