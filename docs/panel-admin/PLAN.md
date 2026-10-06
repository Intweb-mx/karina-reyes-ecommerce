# Plan del panel administrativo de inttimo

> Estado: **propuesta para revisión** · Fecha: 2026-10-06 · Actualizado: 2026-10-06 (sin Marketing ni roles; reembolsos desde el panel)
> Alcance: todas las funciones que debe tener el panel de un e-commerce, adaptadas a inttimo, con lo que ya existe hoy y en qué fase se construye cada cosa.
> Fuentes: `CLAUDE.md` (§12–§27, §30–§31), código actual en `apps/inttimo/src/app/panel/`, `docs/preventa/README.md`.

---

## 1. Para qué existe el panel

El panel sirve para que el negocio opere **sin tocar código, sin entrar a Stripe/SkyDropX y sin pedir ayuda técnica** en el día a día. Cada pantalla debe responder a una pregunta concreta:

| Pregunta del día a día | Dónde se responde |
|---|---|
| ¿Qué tengo que hacer hoy? | **Por hacer** |
| ¿Dónde está el pedido de tal persona? | **Pedidos** |
| ¿Cuánto hemos vendido? | **Resumen** |
| ¿Qué vendemos, a qué precio y cuánto queda? | **Productos** / **Inventario** |
| ¿Algo falló (pago, correo, guía)? | **Por hacer → Incidencias** |
| ¿Quién cambió esto? | **Actividad** |

### Principios de diseño

1. **Lenguaje del negocio, no del sistema.** "Pedido", "guía", "listo para recoger"; nunca `reservation`, `fulfillment`, JSON, slugs o comandos.
2. **Una acción principal por pedido.** Cada pedido muestra un solo bloque de "Siguiente paso" con el botón correcto según su estado. El resto es información.
3. **La información aparece una sola vez.** Nada de estados repetidos en tres tarjetas.
4. **Lo peligroso pide confirmación** (reembolsar, cancelar, cambiar precio, cerrar preventa) y queda en Actividad.
5. **Lo técnico se separa.** Los ajustes que solo debe tocar soporte (perfil de envío, preguntas, credenciales) van en Ajustes → Avanzado.
6. **Nunca se oculta un fallo.** Si un correo, una guía o un webhook falló, aparece en Incidencias hasta resolverse (CLAUDE.md §33).
7. **Funciona en el celular.** Karina debe poder marcar "listo para recoger" desde el teléfono.

---

## 2. Qué existe hoy (preventa UNO+UNO)

| Pantalla actual | Qué hace | Problema |
|---|---|---|
| Inicio `/panel` | Pedidos por enviar, pedidos por recoger y tarjeta por preventa con métricas | Mezcla trabajo pendiente con métricas. La lista completa de pedidos queda escondida tras "Ver todos los pedidos". |
| Preventa `/panel/campanas/[slug]` | Tabla de pedidos, búsqueda, filtro por pago, exportar CSV, 4 métricas | Es la única lista de pedidos, pero se llama "preventa". No filtra por estado de entrega. Muestra "Procesando (OXXO)" aunque el código no activa OXXO (confirmar en el dashboard de Stripe). |
| Pedido `/panel/reservas/[id]` | Pasos de envío o recolección, datos, dirección, respuestas, historial | 7 tarjetas. El estado de la entrega aparece 3 veces. Para reembolsar hay que ir a Stripe. |
| Editar preventa `/panel/campanas/[slug]/editar` | Precio, fechas, entrega, puntos, preguntas (JSON) y términos | Mezcla ajustes del negocio con ajustes técnicos. Las preguntas se editan en JSON. |
| Actividad `/panel/bitacora` | Auditoría de acciones | Útil, pero ocupa lugar en el menú principal y se usa poco. |
| Login + 2FA | Supabase Auth, rol `admin`, MFA obligatorio | Bien. Los usuarios solo se crean por CLI (`pnpm admin`). |

**Solo por CLI hoy:** crear o revocar administradores, crear preventas (`presale:upsert`), reconciliar con Stripe (`presale:reconcile`), configurar el bonus y el perfil de envío.

---

## 3. Arquitectura de información propuesta

### Menú (tienda completa)

```text
Por hacer          ← pantalla de inicio
Pedidos
Clientes
Productos
  ├─ Catálogo
  ├─ Inventario
  └─ Preventas
Contenido
Resumen            ← reportes y métricas
Ajustes
  ├─ Tienda (datos, políticas, correos)
  ├─ Envíos y recolección
  ├─ Pagos
  ├─ Usuarios y permisos
  ├─ Actividad
  └─ Avanzado (solo soporte)
```

### Menú mientras solo existe la preventa (Fase A)

```text
Por hacer · Pedidos · Preventa · Resumen · Ajustes
```

Las secciones de la tienda completa no se muestran (ni "próximamente") hasta que existan.

---

## 4. Módulos y funciones

Leyenda de fase:
- **A** = ahora, solo preventa (permitido por la excepción de CLAUDE.md §1).
- **B** = tienda base. Gate de §1 levantado el 2026-10-06; stack propio (`docs/decisions/ADR-ECOMMERCE-PLATFORM.md`). Se construye ya, oculta al público hasta que termine la preventa.
- **C** = crecimiento, después del lanzamiento de la tienda.

Leyenda de estado: ✅ existe · 🟡 parcial · ⬜ falta.

### 4.1 Por hacer (bandeja de trabajo)

Pantalla de inicio. Solo muestra lo que requiere acción, ordenado del más antiguo al más nuevo.

| Función | Fase | Estado |
|---|---|---|
| Pedidos pagados por enviar (sin guía) | A | ✅ |
| Pedidos con guía impresa pendientes de entregar a la paquetería ("marcar enviado") | A | ⬜ |
| Pedidos de recolección por preparar y avisar | A | ✅ |
| Pedidos avisados que el cliente no ha recogido (con días de espera) | A | ⬜ |
| **Incidencias:** guía fallida, correo de confirmación/envío fallido, bonus no enviado, pago sin confirmar por webhook, envío sin dirección completa | A | ⬜ |
| Contador por bloque, enlace directo al pedido y botón de acción | A | ✅ |
| Stock bajo / agotado | B | ⬜ |
| Solicitudes de cambio o reembolso | B | ⬜ |

### 4.2 Pedidos

**Lista**

| Función | Fase | Estado |
|---|---|---|
| Lista global de todos los pedidos (no por preventa) | A | 🟡 solo por campaña |
| Búsqueda por nombre, correo, teléfono, folio o número de guía | A | 🟡 sin teléfono ni guía |
| Filtros: pago, entrega (por preparar / guía lista / enviado / listo para recoger / entregado), método de entrega, fecha | A | 🟡 solo pago |
| Pestañas rápidas: Por preparar · En camino · Entregados · Cancelados/reembolsados | A | ⬜ |
| Exportar a Excel/CSV respetando filtros, con respuestas del cuestionario | A | 🟡 sin cuestionario |
| Paginación | A | ✅ |
| Acciones en lote: imprimir varias guías, marcar varios como enviados | B | ⬜ |
| Filtros por producto y origen/UTM | B | ⬜ |

**Detalle del pedido** (reorganizado)

```text
┌ Encabezado: Nombre · Folio · fecha · [Pagado] [Envío a domicilio]
├ SIGUIENTE PASO (un solo bloque con el botón correcto)
│   Generar guía → Imprimir guía → Marcar entregado a paquetería → Marcar entregado
│   o: Avisar que está listo → Marcar recogido
├ Cliente y entrega: contacto, dirección o punto, paquetería, guía y rastreo
├ Pago: productos, envío, total, reembolsado, [Reembolsar]
├ Respuestas (al comprar + cuestionario post-compra)
├ Notas internas
└ Historial (línea de tiempo, solo lectura)
```

| Función | Fase | Estado |
|---|---|---|
| Bloque único de "Siguiente paso" según estado | A | 🟡 hay pasos, pero repartidos |
| Generar guía SkyDropX e imprimirla (PDF 4×6) | A | ✅ |
| Registrar guía hecha por fuera | A | ✅ |
| Marcar enviado / listo para recoger / entregado (con correo automático) | A | ✅ |
| Reenviar correo (confirmación, envío, bonus) manualmente | A | 🟡 solo bonus |
| **Reembolso total o parcial desde el panel** (vía `gateway.ts`, con confirmación y motivo) | A | ⬜ hoy por Stripe |
| **Cancelar pedido** (libera unidades de la preventa) | A | ⬜ |
| **Notas internas** (append-only, con autor) | A | ⬜ |
| Corregir dirección o teléfono antes de generar guía (queda en historial) | A | ⬜ |
| Cambiar método de entrega (recolección ↔ envío) con ajuste de cobro | B | ⬜ |
| Imprimir hoja de empaque | B | ⬜ |
| Registrar incidencia de entrega (extravío, daño, devolución) | B | ⬜ |
| Historial con eventos de pago, correo, guía y paquetería | A | ✅ |
| Tracking sincronizado automáticamente desde SkyDropX (webhook o consulta) | B | ⬜ |
| Facturación (si se aprueba, §29) | C | ⬜ |

### 4.3 Clientes

| Función | Fase | Estado |
|---|---|---|
| Lista de clientes (por correo), con número de pedidos y total gastado | B | ⬜ |
| Ficha: datos, direcciones, pedidos, consentimiento de marketing | B | ⬜ |
| Exportar clientes con consentimiento de marketing (para newsletter) | B | ⬜ |
| Solicitudes ARCO / borrar o anonimizar datos (aviso de privacidad) | B | ⬜ |
| Segmentos (compradores de preventa, recurrentes) | C | ⬜ |

### 4.4 Productos y catálogo

| Función | Fase | Estado |
|---|---|---|
| Crear/editar producto: nombre, descripción, imágenes, SEO, estado (borrador/publicado/archivado) | B | ⬜ |
| Variantes y SKUs, precio, precio comparativo, costo | B | ⬜ |
| Peso y medidas por variante (para cotizar envío) | B | ⬜ |
| Categorías y territorios (conversación, conexión, intimidad…) | B | ⬜ |
| Productos relacionados | B | ⬜ |
| Paquetes (bundles) con SKU propio | B | ⬜ |
| Productos digitales (archivo descargable, acceso) | C | ⬜ |
| Vista previa antes de publicar | B | ⬜ |

### 4.5 Inventario

| Función | Fase | Estado |
|---|---|---|
| Unidades de la preventa: vendidas / disponibles / tope | A | 🟡 se ve "piezas pagadas"; falta "quedan X de Y" |
| Existencias por SKU: en mano, reservado, disponible, por llegar | B | ⬜ |
| Umbral de stock bajo y alerta | B | ⬜ |
| Movimientos auditables: recepción, venta, ajuste, devolución, con motivo | B | ⬜ |
| Ajuste manual con motivo obligatorio | B | ⬜ |
| Política de sobreventa por producto | B | ⬜ |

### 4.6 Preventas (campañas)

| Función | Fase | Estado |
|---|---|---|
| Editar nombre, fechas, precio (sin compras), máximo por compra | A | ✅ |
| Abrir / ocultar / cerrar preventa con confirmación | A | ✅ |
| Tope de unidades visible y editable | A | ⬜ (solo CLI) |
| Activar recolección y envío; editar puntos de recolección | A | ✅ |
| Editar preguntas con formulario (no JSON) | A | 🟡 JSON |
| Configurar bonus (título, PDF, video, días de vigencia) | A | ⬜ (solo CLI) |
| Publicar nueva versión de términos (con historial) | A | ✅ |
| Crear una preventa nueva desde el panel | B | ⬜ (solo CLI) |
| Ver la página pública | A | ✅ |

### 4.7 Pagos y reembolsos

| Función | Fase | Estado |
|---|---|---|
| Estado de pago en lista y detalle | A | ✅ |
| Enlace al pago en Stripe | A | ✅ |
| Reembolso total/parcial desde el panel (ver 4.2) | A | ⬜ |
| Pagos sin confirmar: detectar y reconciliar con Stripe desde el panel (hoy `presale:reconcile`) | A | ⬜ |
| Conciliación: ventas del periodo contra pagos de Stripe | B | ⬜ |
| Pasarela de la tienda completa (Stripe o Mercado Pago, por decidir) | B | ⬜ |

### 4.8 Envíos y recolección

| Función | Fase | Estado |
|---|---|---|
| Cotizar y generar guía SkyDropX desde el pedido | A | ✅ |
| Perfil de envío (origen, caja, peso, nota SAT) | A | 🟡 solo CLI; mostrar resumen de solo lectura |
| Paqueterías permitidas / bloqueadas | B | ⬜ |
| Estrategia de selección (más barato, más rápido, balanceado, elige el cliente) | B | ⬜ |
| Envío gratis a partir de cierto monto | B | ⬜ |
| Sincronizar eventos de la paquetería y marcar "enviado"/"entregado" automáticamente | B | ⬜ |
| Puntos de recolección con horario | A | ✅ |

### 4.9 Contenido (CMS)

| Función | Fase | Estado |
|---|---|---|
| Políticas legales (términos, privacidad, envíos, cambios), con versiones | B | ⬜ (hoy en archivos del repo) |
| Preguntas frecuentes | B | ⬜ |
| Banners y llamados a la acción con fechas | B | ⬜ |
| Testimonios (con aprobación) | B | ⬜ |
| Recursos (artículos, PDFs) | C | ⬜ |
| Encabezado y pie de página | C | ⬜ |
| Redirecciones 301 | C | ⬜ |

### 4.10 Correos y notificaciones

| Función | Fase | Estado |
|---|---|---|
| Correos automáticos: pago confirmado, listo para recoger, enviado (+ bonus), entregado | A | ✅ |
| Ver qué correos se enviaron por pedido y si fallaron | A | 🟡 en historial |
| Reenviar un correo concreto | A | ⬜ |
| Vista previa de cada plantilla | B | ⬜ |
| Editar textos de plantillas sin código | C | ⬜ |
| Aviso interno al equipo (correo/WhatsApp) cuando entra un pedido | B | ⬜ |

### 4.11 Resumen (reportes)

Solo métricas reales (CLAUDE.md §22).

| Función | Fase | Estado |
|---|---|---|
| Ventas netas, pedidos pagados, piezas vendidas | A | ✅ |
| Unidades restantes de la preventa y días para el cierre | A | ⬜ |
| Pedidos por estado de entrega | A | ⬜ |
| Ventas por día (gráfica) | A | ⬜ |
| Envío vs recolección; costo total de guías | A | ⬜ |
| Resumen del cuestionario post-compra (conteo por respuesta) | A | ⬜ |
| Ticket promedio, productos más vendidos | B | ⬜ |
| Comparar periodos | C | ⬜ |
| Conversión / carritos abandonados (solo con instrumentación fiable) | C | ⬜ |

### 4.12 Usuarios y seguridad

| Función | Fase | Estado |
|---|---|---|
| Login con 2FA obligatorio | A | ✅ |
| Invitar, ver y revocar usuarios desde el panel (hoy `pnpm admin`) | A | ⬜ |
| Reiniciar 2FA de otro usuario | A | ⬜ |
| Cerrar sesión por inactividad | B | ⬜ |

### 4.13 Actividad (auditoría)

| Función | Fase | Estado |
|---|---|---|
| Registro de quién hizo qué, sin edición ni borrado | A | ✅ |
| Mover a Ajustes → Actividad | A | ⬜ |
| Filtros por usuario, acción y fecha | B | ⬜ |
| Enlace de cada acción al pedido o preventa afectada | A | ⬜ |

### 4.14 Salud del sistema (solo soporte)

| Función | Fase | Estado |
|---|---|---|
| Webhooks de Stripe recibidos/fallidos | A | ⬜ |
| Errores de SkyDropX y de envío de correos | A | 🟡 en historial del pedido |
| Estado de configuración: Stripe live/test, SkyDropX listo, correo verificado | A | ⬜ |
| Botón "reconciliar pagos con Stripe" | A | ⬜ |

### 4.15 Asistente con IA

Fase C, no bloquea el lanzamiento (§30). Solo lectura y sugerencias: "pedidos sin guía", "resume ventas de la semana", borradores de SEO. Cualquier cambio requiere confirmación y queda en Actividad.

---

## 5. Acceso

Por ahora hay **un solo rol (`admin`) con acceso total**. Usan el panel la dueña del negocio (Karina) y el equipo técnico. No se construyen roles ni permisos por pantalla.

Si más adelante entra personal de empaque u operación, se agrega un rol limitado (ver pedidos y marcar entregas, sin reembolsos ni ajustes). El rol seguiría en `app_metadata.role`.

---

## 6. Hoja de ruta

### Fase A — Ordenar el panel de la preventa (ahora)

Permitida por la excepción de §1. Sin tablas nuevas, salvo notas internas y, si se aprueba, reembolsos.

1. **Navegación nueva:** Por hacer · Pedidos · Preventa · Resumen · Ajustes. Actividad pasa a Ajustes.
2. **Por hacer:** agregar "guía lista, falta entregar a paquetería", "avisados sin recoger" e **Incidencias**.
3. **Pedidos (lista global):** pestañas por estado de entrega, búsqueda por teléfono y guía, exportación con cuestionario. Quitar "Procesando (OXXO)" si OXXO no está activo en Stripe.
4. **Detalle del pedido:** un solo bloque "Siguiente paso", sin datos repetidos, notas internas, reenviar correos.
5. **Reembolsar y cancelar desde el panel** (aprobado): total o parcial, con confirmación, motivo y registro en Actividad.
6. **Preventa:** "quedan X de 500", preguntas con formulario, bonus editable, perfil de envío en solo lectura.
7. **Resumen:** ventas por día, estados de entrega, resultados del cuestionario.
8. **Usuarios:** invitar y revocar desde Ajustes.
9. **Salud:** estado de Stripe/SkyDropX/correo y botón para reconciliar.

Orden sugerido: 1 → 4 → 2 → 3 → 5 → 6 → 7 → 8 → 9. Los puntos 1 a 4 resuelven la confusión actual; del 5 en adelante se agregan funciones nuevas.

### Fase B — Tienda base (en construcción desde 2026-10-06)

Stack propio (ADR-ECOMMERCE-PLATFORM): todo se construye en este repo sobre Supabase + Drizzle. Las rutas públicas de la tienda quedan ocultas detrás de un interruptor de servidor hasta que el usuario las active, al terminar la preventa. El panel sí crece de inmediato.

Productos, inventario, clientes, pagos de la tienda, envíos configurables, CMS de políticas y FAQ, sincronización de tracking y reportes de tienda.

### Fase C — Crecimiento

Productos digitales, plantillas de correo editables, comparativos, segmentos, facturación e IA.

---

## 7. Decisiones

**Tomadas (2026-10-06):**
- Usan el panel Karina (dueña) y el equipo técnico, todos con acceso total. Sin roles por ahora.
- Reembolsos (total y parcial) desde el panel.
- Fuera de este plan: cupones/promociones y módulo de iglesias/cotizaciones.
- Gate de §1 levantado. Plataforma: stack propio (Supabase + Drizzle). La tienda se construye oculta; al público solo se le muestra la preventa hasta que termine.

**Pendientes:**

| Decisión | Quién | Bloquea |
|---|---|---|
| ¿Cancelar un pedido libera la unidad para otro comprador? | Karina | A-5 |
| ¿Pasarela de la tienda: Stripe o Mercado Pago? | Usuario | 4.7 Fase B |
| ¿Facturación? ¿Con qué proveedor? | Karina | 4.2 Fase C |
| ¿Aviso interno al equipo por cada pedido nuevo? ¿Por qué canal? | Karina | 4.10 |

---

## 8. Criterios de aceptación del panel

- Karina completa un envío (generar guía → imprimir → marcar enviado) y una recolección (avisar → marcar recogido) sin ayuda y sin entrar a Stripe ni a SkyDropX.
- Encontrar cualquier pedido por nombre, correo, teléfono, folio o guía toma menos de 3 clics.
- Toda incidencia (pago, correo, guía) aparece en Por hacer hasta resolverse.
- Ninguna pantalla muestra códigos internos, JSON ni comandos.
- Toda acción que cambia dinero, estado o configuración queda en Actividad.
- Funciona en 375 px (celular) y en escritorio.
- Lint, typecheck y tests pasan; prueba E2E del flujo envío/recolección.
