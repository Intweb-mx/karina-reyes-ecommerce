# ADR-001 — Repositorio separado del monorepo de Karina Reyes

- **Estado:** Aceptada
- **Fecha:** 2026-09-28
- **Ver también:** ADR-008 en el repo `karina-reyes-ecosyste` (decisión espejo, contexto completo).

## Contexto

El proyecto nació como un monorepo único (`karina-reyes-ecosyste`) con la web de Karina Reyes, su panel/CMS propio, e `apps/inttimo` reservado para la Fase 2 (ver ADR-001 de ese repo). El usuario decidió separar inttimo a este repositorio propio antes de iniciar el desarrollo real de la Fase 2.

## Decisión

- Este repositorio (`karina-reyes-ecommerce`) contiene únicamente inttimo: `apps/inttimo` + `packages/*` propios.
- Estructura y convenciones (pnpm workspace, TypeScript estricto, Next.js App Router, Tailwind, tokens por app) heredadas del repo de Karina Reyes, pero sin dependencia de código entre repos.
- Paquetes compartidos duplicados al momento del split (no referenciados desde el otro repo): `packages/tsconfig`, `packages/storage`, y `mail.ts`/`escapeHtml` de `packages/shared-utils`. Se renombraron al scope `@inttimo/*` (antes `@kr/*`) para evitar confusión entre repos.
- `packages/database` **no** se trajo: no existe todavía esquema de inttimo (productos, pedidos, inventario). Se diseña desde cero aquí cuando arranque la Fase 2, siguiendo CLAUDE.md §23–24.
- `apps/inttimo` hoy es un scaffold Next.js vacío (layout + página placeholder), sin checkout, pagos, SkyDropX ni panel operativo — el gate de aprobación de CLAUDE.md sigue vigente.

## Alternativas consideradas

- Mantener inttimo dentro del monorepo original (descartada por decisión explícita del usuario: aislamiento total de repos/despliegues entre marcas).
- Compartir `packages/*` vía paquete npm privado publicado desde el repo de Karina Reyes (descartada por ahora: requiere registry privado; se puede reconsiderar si la duplicación empieza a doler).

## Consecuencias

- Historial de Git, remoto de GitHub y (a futuro) proyecto de Vercel completamente independientes del repo de Karina Reyes.
- Cambios a los paquetes duplicados no se sincronizan automáticamente entre repos; hay que replicarlos a mano si se quiere mantenerlos alineados.
- El CLAUDE.md de este repo contiene solo lo relevante a inttimo (Parte B + reglas generales de implementación de Parte C del CLAUDE.md original); las secciones de Karina Reyes viven en el otro repo.
