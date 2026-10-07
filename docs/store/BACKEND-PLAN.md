# Backend de la tienda: plan general

Implementa lo que pide frontend en [BACKEND-REQUEST.md](./BACKEND-REQUEST.md) y en `apps/inttimo/src/lib/store/contract.ts` + `admin-contract.ts`. Decisión del usuario (2026-10-07): construir **todo** antes de abrir la tienda. La tienda sigue oculta en producción (`NEXT_PUBLIC_STORE_ENABLED`) hasta que el usuario la active, al terminar la preventa.

| # | Subproyecto | Estado |
|---|---|---|
| 0 | Poner al día el PR #19 con `main` | hecho |
| 1 | Base de datos e inventario ([diseño](./subproyecto-1-diseno.md), [plan](./subproyecto-1-plan.md)) | en curso |
| 2 | Catálogo y carrito: `GET /api/tienda/productos`, `/productos/[slug]`, `POST /carrito/cotizar` | pendiente |
| 3 | Entrega, envío y código postal: `/entrega`, `/envio/cotizar`, `/codigo-postal/[cp]` | pendiente |
| 4 | Checkout, Stripe y webhook: `/checkout`, `/pedido/confirmacion` | pendiente |
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
