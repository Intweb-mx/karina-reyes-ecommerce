# inttimo — e-commerce

Repositorio de **inttimo**, la marca de e-commerce del ecosistema digital de Karina Reyes.

La web personal de Karina Reyes vive en un repositorio separado: [`karina-reyes-ecosyste`](https://github.com/Intweb-mx/karina-reyes-ecosyste).

Toda la operación de este repositorio está en [`CLAUDE.md`](./CLAUDE.md). Léelo antes de tocar código — incluye un **gate obligatorio** para la tienda completa, con una excepción aprobada para la preventa.

## Estado actual

- **Preventa de UNO+UNO** (prioridad 1): backend completo — base de datos, API, Stripe Checkout, webhooks, correos y CLI de operación. Contrato de API para frontend y guía de operación en [`docs/preventa/README.md`](./docs/preventa/README.md). Las páginas las construye frontend: guía de arranque en [`docs/frontend.md`](./docs/frontend.md).
- Tienda completa: bloqueada por el gate (ver CLAUDE.md §1).

## Comandos

```bash
pnpm install
pnpm db:local        # PostgreSQL local en :54332 (dejarlo corriendo)
pnpm db:migrate
pnpm dev:inttimo     # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
