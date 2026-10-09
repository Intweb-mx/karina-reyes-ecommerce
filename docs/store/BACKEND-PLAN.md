# Backend de la tienda: plan general

Implementa lo que pide frontend en [BACKEND-REQUEST.md](./BACKEND-REQUEST.md) y en `apps/inttimo/src/lib/store/contract.ts` + `admin-contract.ts`. Decisión del usuario (2026-10-07): construir **todo** antes de abrir la tienda. La tienda sigue oculta en producción (`NEXT_PUBLIC_STORE_ENABLED`) hasta que el usuario la active, al terminar la preventa.

| # | Subproyecto | Estado |
|---|---|---|
| 0 | Poner al día el PR #19 con `main` | hecho |
| 1 | Base de datos e inventario ([diseño](./subproyecto-1-diseno.md), [plan](./subproyecto-1-plan.md)) | listo, en revisión (PR pendiente) |
| 2 | Catálogo y carrito: `GET /api/tienda/productos`, `/productos/[slug]`, `POST /carrito/cotizar` | PR A "Vender" ([diseño](./vender-diseno.md), [plan](./vender-plan.md)) |
| 3 | Entrega, envío y código postal: `/entrega`, `/envio/cotizar`, `/codigo-postal/[cp]` | PR A "Vender" |
| 4 | Checkout, Stripe y webhook: `/checkout`, `/pedido/confirmacion`, `pnpm store:reconcile` | PR A "Vender" |
| 5 | Pedidos de la tienda en el panel, con reembolsos y cancelación | pendiente |
| 6 | Productos e inventario en el panel | pendiente |
| 7 | Rastreo, cuenta, contacto, iglesias y newsletter | pendiente |
| 8 | Resumen del panel | pendiente |

## Decisiones

- Los pedidos de la tienda viven en tablas `store_*`, separadas de `presale_*` (la preventa tiene dinero real y sigue abierta hasta el 15 de octubre de 2026). Se comparte el código de Stripe, SkyDropX y correos.
- Stock sin sobreventa: se aparta al iniciar el checkout, se descuenta al confirmarse el pago y se libera si el pago no llega (sesión de 30 minutos más 5 de gracia). Un pago tardío sin stock deja el pedido pagado como excepción para reembolsarlo.
- Si el contrato de frontend debe cambiar, se edita `contract.ts` y el simulador (`mock.ts`) en el mismo PR que el endpoint.

## Pendientes de negocio (no inventar)

1. **Precio de tienda** de UNO+UNO (hoy `price = null`: el producto no se puede comprar).
2. **Términos y Condiciones de la tienda** (los actuales son de la preventa).
3. **Paquetes y precios para iglesias.**
4. **Proveedor de newsletter** y de correos de la tienda.
5. **Fotos y textos oficiales.**
6. **Máximo por pedido de UNO+UNO** (hoy 10, el valor por defecto) y **clasificación por territorios** (copiada del simulador).
7. **Cupones:** el contrato los menciona pero no están en el alcance; decidir antes del subproyecto 2.

## Notas para los siguientes subproyectos

- Subproyecto 2: la lectura de catálogo y carrito no debe escribir. Calcular lo disponible como `existencias − apartado + apartados ya vencidos`, sin llamar a `releaseExpiredStoreOrders` en cada GET.
- Subproyecto 4: ANTES de abrir el checkout, arreglar la ruta caliente `releaseExpiredStoreOrders`: pre-chequeo sin bloqueo (saltar si no está `pending` o no tiene `inventoryReserved`), `ORDER BY checkout_expires_at` con límite pequeño, `try/catch` con registro para que un error de liberación no aborte el checkout, y liberación masiva desde el comando de reconciliación o un cron.
- Subproyecto 4: el webhook debe verificar monto y moneda contra `totalAmount` antes de marcar pagado.
- Subproyecto 4: poner el id del pedido en `client_reference_id`/metadata de Stripe para encontrar el pedido aunque falle `attachStoreCheckoutSession`.
- Subproyecto 4: si `attachStoreCheckoutSession` devuelve null, expirar la sesión de Stripe.
- Subproyecto 4: decidir si se permiten métodos de pago asíncronos (OXXO caería siempre en la ruta de pago tardío).
- Subproyecto 4: con una `idempotencyKey` repetida solo devolver una sesión pendiente y vigente; si no, responder 409 (como el `replay()` de la preventa).
- Subproyecto 6: validar el motivo de `adjustStock` en la ruta (enum con Zod) o con una guarda en la función.
- Subproyecto 6: recordar que `fulfillment_status` vale `confirmed` incluso sin pagar: todo filtro del panel o del rastreo debe revisar `paymentStatus` primero.
- Las notas de los subproyectos 2 y 4 quedan atendidas en PR A (ver [vender-diseno.md](./vender-diseno.md)). Pendiente de decidir: si la tienda limita Stripe a tarjeta (pagos asíncronos como OXXO caen en la ruta de pago tardío).

## Antes de abrir la tienda al público

- [ ] **Orden de fusión:** PR #19 → subproyecto 1 (`feat/tienda-base-datos`) → PR A "Vender" (`feat/tienda-vender`). Las migraciones 0010–0013 corren juntas en el primer build de producción después de fusionar.
- [ ] `STORE_NOTIFY_EMAIL` (o, en su lugar, `PRESALE_NOTIFY_EMAIL`) configurado en Vercel Production. Sin él, los pedidos pagados, los pagos con incidencia y los cobros con monto distinto **solo quedan en los logs**: nadie del equipo recibe aviso.
- [ ] `NEXT_PUBLIC_STORE_API=http` en Production (con `mock` el frontend usa datos de ejemplo).
- [ ] `pnpm store:seed` en producción y, desde el panel (PR B), poner precio, existencias y `on_sale` a UNO+UNO. El seed lo deja en `coming_soon` y sin precio: no se puede comprar.
- [ ] Decidir si se acepta solo tarjeta o también métodos asíncronos como OXXO (se configura en el dashboard de Stripe). Un pago asíncrono que llega después de liberarse el apartado cae en la ruta de "pagado sin stock" (excepción y reembolso).
- [ ] Programar `pnpm store:reconcile` (Vercel Cron o equivalente). Es la red de seguridad si un webhook no llega y libera apartados vencidos en bloque. El plan Hobby de Vercel solo permite crons diarios: decidir el plan y la frecuencia.
- [ ] Los cambios de frontend de [FRONTEND-NOTAS.md](./FRONTEND-NOTAS.md) hechos y probados en modo `http`.
- [ ] Compra con tarjeta real (monto mínimo) y su reembolso desde Stripe: pedido pagado, correo al cliente, aviso al equipo, stock descontado y reembolso registrado.
- [ ] `NEXT_PUBLIC_STORE_ENABLED=1` solo en Production y solo cuando el usuario lo indique. Nunca en un Preview con llaves live de Stripe.

## Verificación después de desplegar

Comprobaciones de solo lectura en la base de producción una vez desplegada la migración:

- Las tablas existen (debe dar 9 desde la migración 0012): `select count(*) from information_schema.tables where table_name like 'store_%';`
- `anon` y `authenticated` no tienen permisos sobre ellas (debe dar 0 filas): `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_name like 'store_%' and grantee in ('anon','authenticated');`
- Lo mismo para las secuencias (debe dar 0 filas): `select * from information_schema.role_usage_grants where object_type = 'SEQUENCE' and object_name like 'store_%' and grantee in ('anon','authenticated');`
