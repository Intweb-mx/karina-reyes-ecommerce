# Despliegue a producción — inttimo (preventa)

Stack: **Vercel** (app Next.js) + **Supabase** (PostgreSQL + Auth) + **Resend** (correo) + **Stripe** (pagos; se configura en la fase del motor de pagos).

Las cuentas deben quedar **a nombre del cliente**, con el equipo técnico como miembro invitado.

## 1. Supabase

1. Crear el proyecto en el plan **Pro** (el gratis pausa proyectos inactivos y no tiene respaldos diarios). Región: la más cercana a la región de funciones de Vercel. Recomendado `us-east-1` (Vercel `iad1`) para México.
2. Guardar la contraseña de la base en el gestor de contraseñas del cliente.
3. **Settings → API → Data API → Exposed schemas:** quitar `public` y dejar solo `graphql_public`. El navegador nunca consulta tablas (ADR-003). Aunque se expusiera por error, las tablas tienen RLS sin políticas y sin permisos para `anon`/`authenticated`.
4. **Authentication → Sign In / Providers:**
   - *Allow new users to sign up*: **desactivado**.
   - Proveedor **Email**: **activado**. Si se desactiva, nadie puede iniciar sesión.
   - *Confirm email*: indiferente (los administradores se crean ya confirmados).
5. **Authentication → Policies / Passwords:** mínimo 12 caracteres, con minúsculas, mayúsculas y números. Activar la protección contra contraseñas filtradas.
6. **Authentication → Multi-Factor:** TOTP **habilitado** (el panel lo exige a todos los administradores).
7. **Authentication → URL Configuration:** *Site URL* = `https://<dominio>`; *Redirect URLs* = `https://<dominio>/**`.
8. **Authentication → Emails → SMTP:** configurar Resend (paso 3). Hoy Auth solo envía correos si se usan invitaciones o recuperación por correo; las altas y reseteos se hacen por CLI.
9. **Database → Backups:** confirmar respaldos diarios. PITR es opcional según presupuesto.

### Cadenas de conexión (Connect → ORMs)

| Variable | Qué usar | Para qué |
|---|---|---|
| `DATABASE_URL` | Pooler **transaction** (puerto `6543`) | App en Vercel (serverless) |
| `DATABASE_PREPARE` | `false` | Obligatorio con el pooler en modo transacción |
| `DATABASE_MAX_CONNECTIONS` | `2` | Por instancia de función; el pooler multiplexa |
| `DATABASE_URL_UNPOOLED` | Pooler **session** (puerto `5432`) o conexión directa | Migraciones en el build |

## 2. Vercel

1. Importar el repo `Intweb-mx/karina-reyes-ecommerce`. **Root Directory:** `apps/inttimo`. Framework: Next.js. Install: `pnpm install`. Build: por defecto (`pnpm build`, que antes aplica migraciones solo si `VERCEL_ENV=production`).
2. **Settings → Functions → Region:** la misma zona que Supabase (p. ej. `iad1`).
3. Node.js 22 o superior.
4. Variables de entorno (Production; en Preview usar un proyecto de Supabase **distinto**, nunca el de producción):

| Variable | Production | Notas |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<dominio>` | Sin `/` final |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Pública por diseño |
| `DATABASE_URL`, `DATABASE_PREPARE`, `DATABASE_MAX_CONNECTIONS`, `DATABASE_URL_UNPOOLED` | ver tabla anterior | |
| `MAIL_DRIVER` | `resend` | `log`/`file` están bloqueados en producción |
| `MAIL_FROM` | `inttimo <hola@<dominio>>` | Dominio verificado en Resend |
| `RESEND_API_KEY` | `re_…` | |
| `PRESALE_NOTIFY_EMAIL` | opcional | Aviso interno por reserva pagada |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | fase del motor de pagos | Sin ellas la preventa responde "pago no disponible" |

**No** cargar `SUPABASE_SECRET_KEY` en Vercel: la app no la usa. Solo la usa la CLI `pnpm admin`, desde una terminal de confianza.

5. Dominio: agregar el dominio y forzar HTTPS (Vercel lo hace por defecto).

## 3. Resend

1. Agregar y verificar el dominio (registros SPF, DKIM y DMARC en el DNS).
2. Crear una API key con permiso solo de envío.
3. El remitente de `MAIL_FROM` debe usar ese dominio.

## 4. Primer despliegue

```bash
# 1) Deploy a producción desde Vercel: el build aplica las migraciones (incluye RLS).

# 2) Crear el primer administrador contra producción (desde tu máquina):
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_… \
DATABASE_URL="<pooler session 5432>" \
pnpm admin --create --email=persona@dominio.com

# 3) Cargar la campaña con datos aprobados (queda en draft hasta revisarla):
DATABASE_URL="<pooler session 5432>" pnpm presale:upsert --file=campana.json --terms=terminos.md
```

Después, en `https://<dominio>/panel`: iniciar sesión, configurar 2FA, revisar la campaña y activarla.

## 5. Checklist antes de abrir al público

- [ ] Supabase Pro, respaldos diarios activos, región alineada con Vercel.
- [ ] `public` fuera de *Exposed schemas*; registro público desactivado; TOTP activo.
- [ ] Verificación: con la llave publicable, `GET https://<ref>.supabase.co/rest/v1/presale_reservations` responde error (no datos).
- [ ] Variables de Production cargadas; Preview apunta a otro proyecto de Supabase.
- [ ] Dominio de Resend verificado; correo de prueba recibido.
- [ ] Administrador creado, con 2FA configurado; `pnpm admin --list` muestra `2FA`.
- [ ] Campaña con precio, fechas, preguntas y términos **aprobados**; nota de entrega revisada.
- [ ] Stripe configurado y probado de punta a punta (fase del motor de pagos).
- [ ] `/panel` no aparece en buscadores (cabecera `X-Robots-Tag: noindex`).

## Operación

| Tarea | Cómo |
|---|---|
| Ver y buscar reservas, detalle e historial | `/panel` |
| Editar campaña, preguntas y términos | `/panel/campanas/<slug>/editar` |
| Exportar CSV | Botón en `/panel` o `pnpm presale:export` |
| Auditoría | `/panel/bitacora` (append-only) |
| Nuevo admin / reset de contraseña / reset de 2FA / revocar | `pnpm admin --create | --reset-password | --reset-mfa | --revoke --email=…` |
| Sincronizar con Stripe | `pnpm presale:reconcile` (automatizar en la fase del motor de pagos) |

## Desarrollo local

```bash
cp .env.example .env              # completar SUPABASE_SECRET_KEY con el de `supabase start`
pnpm install
pnpm supabase:start               # Supabase local en puertos 55321–55329 (Studio: http://127.0.0.1:55323)
pnpm db:migrate
pnpm admin --create --email=tu@correo.com
pnpm presale:upsert --file=… --terms=…
pnpm dev                          # http://localhost:3100
```
