# Frontend de la preventa — guía de arranque

Para quien diseña y construye las páginas de la preventa de inttimo. El backend (base de datos, API, pagos, panel) ya está hecho; tu trabajo es la interfaz.

## Qué necesitas instalado

- **Node.js 24** o superior (mínimo 22.18).
- **pnpm 12**: `corepack enable` (usa la versión fijada en `package.json`).
- **Docker Desktop**, abierto (Supabase local corre en contenedores).
- **Supabase CLI**: `brew install supabase/tap/supabase`.

## Primera vez

```bash
git clone https://github.com/Intweb-mx/karina-reyes-ecommerce.git
cd karina-reyes-ecommerce
cp .env.example .env
pnpm install
pnpm supabase:start      # base de datos + auth locales (tarda la primera vez)
pnpm db:migrate          # crea las tablas
pnpm dev:seed            # carga una campaña DEMO con preguntas y términos de ejemplo
pnpm dev                 # http://localhost:3100/preventa/demo
```

`.env.example` ya trae los valores locales; no necesitas llaves de producción. Para el panel crea un usuario local con `pnpm admin --create --email=tu@correo`.

Al terminar el día: `pnpm supabase:stop`. Los datos locales se conservan.

## Qué construyes

Dos páginas. Hoy existen como placeholder funcional: rediséñalas libremente, pero **conserva las rutas**, porque Stripe regresa a ellas.

| Ruta | Archivo | Qué es |
|---|---|---|
| `/preventa/[slug]` | `apps/inttimo/src/app/preventa/[slug]/page.tsx` | Página de preventa |
| `/preventa/[slug]/confirmacion` | `apps/inttimo/src/app/preventa/[slug]/confirmacion/page.tsx` | Regreso desde Stripe |

Componentes existentes que ya funcionan (lógica de API, errores, accesibilidad):

- `src/components/presale/Countdown.tsx` — contador; corrige el reloj del cliente con `serverTime`.
- `src/components/presale/ReservationForm.tsx` — datos, cuestionario dinámico, términos, errores por campo, honeypot, `Idempotency-Key`.
- `src/components/presale/ConfirmationStatus.tsx` — estado del pago con reintentos.
- `src/app/globals.css` — tokens de color y tipografía provisionales.

Referencia visual: `docs/mockups/inttimo/` (sobre todo `04-uno-mas-uno-detalle.png`).

**Contrato de la API** (campos, errores, estados): [`docs/preventa/README.md`](./preventa/README.md). Tipos TypeScript: `apps/inttimo/src/server/presale/contract.ts`.

## Reglas

- **Sí** tocas: `src/app/preventa/**`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx`, `public/`.
- **No** tocas sin coordinar: `src/server/**`, `src/app/api/**`, `src/app/panel/**/actions.ts`, `src/proxy.ts`, `packages/**`. Si necesitas un dato que la API no da, pídelo.
- Panel (`src/app/panel/**`): sí puedes rediseñar las pantallas; el contrato está en [`docs/panel-admin/CONTRATO.md`](./panel-admin/CONTRATO.md).
- El cuestionario **siempre** se arma con `questions` de la API; no hardcodear preguntas.
- Precios, fechas, textos legales y de entrega vienen de la base de datos. No escribir datos de negocio en el código; el contenido DEMO es solo para local.
- Montos en centavos: usar `formatMoney` de `src/lib/format.ts`.
- Mobile-first (revisar 375, 768 y 1440 px), foco visible y errores asociados a su campo.

## Estados que puedes probar en local

| Estado | Cómo |
|---|---|
| Formulario con errores | Enviar vacío |
| Pago no disponible (503) | Enviar válido: en local no hay Stripe |
| Preventa por abrir / cerrada | En `docs/preventa/dev/campaign.dev.json` cambia `startsAt`/`endsAt` y corre `pnpm dev:seed` |
| Página de confirmación | Requiere llaves de prueba de Stripe; te las pasamos cuando se configure el motor de pagos |

## Flujo de trabajo

1. Rama desde `main`: `git checkout -b feat/preventa-ui`.
2. Antes de abrir el PR: `pnpm lint && pnpm typecheck && pnpm test`.
3. PR contra `main`. Todo lo que entra a `main` se publica en producción automáticamente.
