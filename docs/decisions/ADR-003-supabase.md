# ADR-003 — Supabase como plataforma de datos y autenticación

- **Estado:** Aceptada
- **Fecha:** 2026-09-28

## Contexto

La preventa pasa a producción con tráfico real. Hay que elegir dónde hospedar PostgreSQL y cómo autenticar el panel de reservas. El backend de la preventa ya usa PostgreSQL estándar con Drizzle. El usuario aclaró que el backend de la web de Karina Reyes es una demo; inttimo es el sistema real, listo para producción, y no hay que copiar la arquitectura de Karina por consistencia.

## Decisión

**Supabase completo** (decisión del usuario, 2026-09-28):

- **Base de datos:** PostgreSQL de Supabase. Drizzle sigue siendo el ORM y la herramienta de migraciones (`packages/database/migrations`). Runtime por el pooler en modo transacción (`DATABASE_URL`, puerto 6543, `DATABASE_PREPARE=false`); migraciones por conexión directa o de sesión (`DATABASE_URL_UNPOOLED`).
- **Autenticación del panel:** Supabase Auth (`@supabase/ssr`, sesión en cookies). Sin registro público. Los administradores se crean por invitación/CLI y se autorizan con `app_metadata.role = "admin"`, que solo puede asignar la service role; el usuario no puede cambiarlo.
- **Acceso a datos:** el servidor valida la sesión con Supabase Auth y lee/escribe con Drizzle por la conexión de servidor. El navegador nunca consulta tablas directamente.
- **Seguridad de la API REST de Supabase:** todas las tablas de negocio tienen RLS activado sin políticas y sin privilegios para `anon`/`authenticated`. La API pública de Supabase no puede leer ni escribir reservas, aunque alguien tenga la llave publicable.
- **Desarrollo local:** Supabase CLI (`supabase start`) en puertos propios (55321–55329) para no chocar con otros proyectos locales. PGlite se queda solo para tests.

## Alternativas consideradas

- **Supabase solo como base de datos + login propio:** más portable, pero hay que construir y mantener contraseñas, recuperación y 2FA. El usuario prefirió usar la plataforma completa.
- **Neon:** buena integración con Vercel, pero no trae autenticación ni panel de datos.
- **supabase-js con RLS para todas las consultas:** duplicaría la capa de datos ya probada (transiciones atómicas, idempotencia) y la lógica de permisos quedaría repartida en políticas SQL.

## Consecuencias

- Dependencia de Supabase para Auth. Los datos siguen siendo PostgreSQL estándar y exportables; migrar la base es cambiar `DATABASE_URL`, pero migrar Auth requeriría rehacer el login.
- Producción requiere el plan Pro (el gratis pausa proyectos inactivos), respaldos diarios y SMTP propio para los correos de Auth.
- Cada tabla nueva debe crearse con RLS activado y sin privilegios para `anon`/`authenticated`; hay un test que lo verifica.
