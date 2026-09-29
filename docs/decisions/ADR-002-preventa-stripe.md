# ADR-002 — Preventa de UNO+UNO con Stripe

- **Estado:** Aceptada
- **Fecha:** 2026-09-28

## Contexto

El usuario definió la preventa de UNO+UNO como prioridad 1 y urgente: página con contador de dos semanas, cuestionario y pago para reservar lugar. Un colaborador construye el frontend; este repo entrega base de datos y backend.

CLAUDE.md bloqueaba todo pago/checkout de inttimo hasta aprobar la web de Karina Reyes y nombraba Mercado Pago como pasarela objetivo. El usuario pidió explícitamente iniciar la preventa ya y usar **Stripe**.

Decisiones del usuario (2026-09-28): producto UNO+UNO; se cobra el **precio completo** al reservar; **sin límite** de lugares.

## Decisión

- Excepción al gate limitada a la preventa. La tienda completa (catálogo, carrito, inventario, SkyDropX, cuentas) sigue bloqueada.
- Pasarela: **Stripe Checkout** alojado (redirección). No se manejan datos de tarjeta en nuestro dominio; Stripe captura también la dirección de envío (solo México).
- Base de datos propia en `packages/database` (PostgreSQL + Drizzle), independiente de proveedor: `presale_campaigns`, `presale_reservations`, `presale_reservation_events` (append-only), `stripe_webhook_events` (idempotencia), `rate_limits`.
- El precio vive solo en la base; el cliente nunca lo envía.
- Estado de pago decidido por webhooks firmados + consulta directa a Stripe en la página de confirmación y en `presale:reconcile`. Nunca por la URL de éxito sola.
- Preguntas del cuestionario definidas como datos de la campaña (JSON validado), no en código.
- La app habla con Stripe a través de `PaymentGateway` (`apps/inttimo/src/server/presale/gateway.ts`); solo ese archivo importa el SDK.
- Administración inicial por CLI (`presale:upsert`, `presale:export`, `presale:reconcile`); panel visual queda para después.

## Alternativas consideradas

- **Mercado Pago** (plan original de CLAUDE.md): descartado para la preventa por instrucción explícita del usuario.
- **Stripe Payment Element embebido**: más control visual pero más superficie (CSP, SCA, estados en cliente). Checkout alojado es más rápido de lanzar y más seguro.
- **Solo guardar tarjeta y cobrar después / anticipo**: el usuario eligió precio completo.
- **Cupo limitado con reserva temporal de lugar**: el usuario eligió sin límite; el esquema no lo impide a futuro.

## Consecuencias

- Hay que crear cuenta de Stripe **a nombre del cliente**, configurar el webhook (ver `docs/preventa/README.md`) y cargar `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` por entorno.
- Precio, fecha de inicio, preguntas, términos de la preventa y texto de entrega deben venir aprobados; la plantilla no se puede cargar sin ellos.
- Queda pendiente decidir si la tienda completa también usará Stripe (reemplazando Mercado Pago en CLAUDE.md §15) — nuevo ADR cuando se decida.
- Facturación (CFDI) y política de reembolso de la preventa no están resueltas; los reembolsos se hacen desde el dashboard de Stripe y el sistema los refleja.
