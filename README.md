# inttimo — e-commerce

Repositorio de **inttimo**, la marca de e-commerce del ecosistema digital de Karina Reyes.

La web personal de Karina Reyes vive en un repositorio separado: [`karina-reyes-ecosyste`](https://github.com/Intweb-mx/karina-reyes-ecosyste).

Toda la operación de este repositorio está en [`CLAUDE.md`](./CLAUDE.md). Léelo antes de tocar código — incluye un **gate obligatorio**: no se construye checkout, pagos, envíos ni panel operativo real hasta que la web de Karina Reyes esté aprobada.

## Estado actual

Scaffold inicial: monorepo pnpm con `apps/inttimo` (Next.js vacío) y `packages/tsconfig`, `packages/storage`, `packages/shared-utils` duplicados desde el repo de Karina Reyes como base reutilizable. Ver `docs/decisions/ADR-001-repositorio-separado.md`.

## Comandos

```bash
pnpm install
pnpm dev:inttimo     # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
