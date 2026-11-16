# ADR-004 — Acceso al panel por correo (sin contraseña ni app autenticadora obligatoria)

- **Estado:** Aceptada
- **Fecha:** 2026-11-16

## Contexto

El panel pedía contraseña y app autenticadora (TOTP) a cada administrador. En la práctica solo una persona del equipo técnico entraba; la dueña del negocio, que es quien opera los pedidos, no tenía acceso porque el alta (contraseña + escanear un QR) le resultaba difícil. El usuario pidió que entrar sea lo más fácil posible para ella. Se descartó un token alfanumérico fijo: es una contraseña compartida sin segundo paso, y el panel reembolsa en Stripe, compra guías y muestra datos personales de clientes.

## Decisión

Decisión del usuario, 2026-11-16:

- **Se entra con el correo.** La persona escribe su correo y recibe un correo con un botón "Entrar al panel" y un código de 6 dígitos (para cuando lee el correo en el celular y entra desde la computadora). Ambos sirven una vez y vencen en 60 minutos.
- **El servidor genera el enlace** con la llave secreta de Supabase (`auth.admin.generateLink`) y lo manda con el proveedor de correo de la app (Resend). Supabase no manda correos, así que no hace falta configurar su SMTP ni sus plantillas. Solo se genera para administradores activos: `generateLink` crea la cuenta si el correo no existe, por eso antes se busca al administrador.
- **La pantalla responde igual** exista o no la cuenta, para no revelar qué correos son de administradores. Límites: 10 solicitudes por IP cada 15 min, 5 por correo por hora, 10 intentos de código por correo cada 15 min.
- **El token va en el fragmento (`#`) del enlace** y se usa al presionar un botón, no al abrir la página: no queda en registros del servidor y un antivirus de correo que abra el enlace no lo gasta.
- **La sesión dura 30 días** desde que se entró (fecha del método de acceso en la sesión de Supabase). Después se vuelve a pedir el correo.
- **Una sesión abierta solo con contraseña ya no da acceso.** La API de Supabase acepta contraseñas aunque la app ya no tenga ese formulario; por eso la regla está en el servidor (`server/auth/policy.ts`), no solo en la pantalla.
- **La app autenticadora es opcional.** Quien ya la tiene activada la sigue usando después del correo. `pnpm admin --reset-mfa` la quita.

## Alternativas consideradas

- **Token alfanumérico fijo:** descartado (contraseña compartida, sin segundo paso, sin saber quién hizo qué).
- **Mantener contraseña + TOTP y solo alargar la sesión:** la dueña seguiría sin poder hacer el alta.
- **Enlace mágico de Supabase (`signInWithOtp`):** requiere SMTP propio y plantillas en el dashboard de Supabase, y con PKCE el enlace solo funciona en el mismo navegador donde se pidió.
- **Passkeys (huella / Face ID):** lo más cómodo, pero hay que confirmar el soporte de Supabase. Queda para después.

## Consecuencias

- El correo de cada administrador pasa a ser su llave: quien controle ese buzón entra al panel. Cada administrador debe tener su correo protegido (idealmente con verificación en dos pasos en el propio correo).
- Producción necesita `SUPABASE_SECRET_KEY` en Vercel (antes solo la usaba el CLI).
- Ya no hay contraseñas: `pnpm admin --create` da acceso sin contraseña y `--reset-password` desaparece (`--grant` devuelve el acceso a una cuenta revocada).
- Si Resend falla, nadie puede entrar hasta que se resuelva; la pantalla lo dice en vez de fingir que se mandó.
