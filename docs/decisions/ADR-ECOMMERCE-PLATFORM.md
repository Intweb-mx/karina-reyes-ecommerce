# ADR-004 — Plataforma del e-commerce: stack propio

- **Estado:** Aceptada
- **Fecha:** 2026-10-06

## Contexto

CLAUDE.md §10 exige decidir la plataforma antes de construir el backend de la tienda completa. El 2026-10-06 el usuario levantó el gate de §1 (la web de Karina está aprobada) y pidió un panel completo para administrar el e-commerce (`docs/panel-admin/PLAN.md`).

La preventa de UNO+UNO ya opera en producción sobre Next.js + Supabase (PostgreSQL + Auth) + Drizzle + Stripe + SkyDropX + Resend, con un panel propio que tiene 2FA, auditoría, generación de guías y correos transaccionales.

## Decisión

**Stack propio sobre lo que ya existe** (decisión del usuario, 2026-10-06):

- Catálogo, inventario, pedidos, clientes y contenido se modelan en `packages/database` con Drizzle, con RLS activado y sin privilegios para `anon`/`authenticated` (ADR-003).
- El panel de la tienda es el mismo `/panel` de la preventa, ampliado. Un solo rol `admin` con acceso total mientras el equipo sea Karina y el equipo técnico.
- Pagos: un adaptador por pasarela. Solo `gateway.ts` (o su equivalente para la tienda) importa el SDK. La pasarela de la tienda (Stripe o Mercado Pago) sigue **pendiente**; por continuidad se recomienda Stripe.
- Envíos: se reutiliza `server/shipping/skydropx.ts`.
- **Visibilidad:** mientras dure la preventa (hasta el 2026-10-15), el sitio público solo muestra la preventa y las páginas legales. Las rutas de la tienda se construyen detrás de un interruptor de servidor y se publican por decisión explícita del usuario.

## Alternativas consideradas

- **Shopify headless:** trae panel, inventario y pedidos, pero tiene costo mensual y obliga a pagar con Shopify Payments o pasarelas compatibles. Además duplicaría lo que ya funciona en la preventa (Stripe, SkyDropX, correos, auditoría).
- **Medusa (open source):** trae un panel incluido, pero es otro servicio que hospedar y operar, con su propio modelo de datos y su propia autenticación, separados de Supabase.

## Consecuencias

- Todo el panel (productos, inventario, pedidos, clientes, reportes) se construye y mantiene en este repo. Es más trabajo inicial, a cambio de control total y una sola base de datos.
- Las reglas de §12 (inventario auditable, sin sobreventa), §15 (webhooks e idempotencia) y §20–21 (pedidos con historial append-only) se implementan en código propio y necesitan tests.
- Los datos son PostgreSQL estándar y se pueden exportar, así que migrar a otra plataforma después es posible, aunque costoso.
