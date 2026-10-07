# CLAUDE.md — inttimo (e-commerce)

> Este archivo es la fuente operativa principal para Claude Code y Cursor en **este repositorio**.
> Léelo completo antes de crear, editar o eliminar archivos.
> Si una instrucción de este archivo contradice una decisión explícita y más reciente del usuario, prevalece la decisión más reciente del usuario y se actualiza este archivo.

---

## 0. Identidad del proyecto y relación con el otro repositorio

Este repositorio contiene **solo inttimo**, la marca de e-commerce del ecosistema digital de Karina Reyes. Es una marca independiente, con su propio storefront y su propia operación.

La **web personal de Karina Reyes** (Fase 1 del ecosistema) vive en un repositorio distinto: `karina-reyes-ecosyste` (GitHub: `Intweb-mx/karina-reyes-ecosyste`). Ese repo tiene su propio `CLAUDE.md` y es la fuente de verdad para todo lo relativo a Karina Reyes, su web y su panel/CMS.

Ver `docs/decisions/ADR-001-repositorio-separado.md` para el contexto completo de por qué inttimo está en repo separado.

No renombres la marca **inttimo**. Se escribe en minúsculas y con doble `t`.

No renombres el producto **UNO+UNO** salvo que el usuario indique lo contrario.

---

## 1. Gate obligatorio — no empezar antes de tiempo

**La Fase 1 (web de Karina Reyes, en el otro repositorio) debe estar terminada y aprobada antes de construir e-commerce real aquí.**

No crear rutas, lógica de checkout, pagos, SkyDropX, inventario real o panel operativo de inttimo mientras el usuario no diga explícitamente algo equivalente a:

> "Ya está aprobada la web de Karina. Inicia el e-commerce / inttimo."

Se puede dejar preparada la arquitectura de este repo (scaffold, tipos, tokens visuales, configuración) pero **no desarrollar lógica de negocio real de la Fase 2 antes de esa aprobación**. Si no tienes constancia de esa aprobación en la conversación actual, pregunta antes de construir cualquier funcionalidad transaccional.

### Excepción aprobada: preventa de UNO+UNO (prioridad 1)

> **Decisión del usuario (2026-09-28):** construir ya la preventa de UNO+UNO — contador de 14 días, cuestionario y pago del precio completo con **Stripe**. **Actualización 2026-09-30:** la preventa real es del 1 al 15 de octubre de 2026, $500 MXN, hasta 500 unidades **sin sobreventa** (`presale_campaigns.total_units`), con las 4 páginas legales aprobadas (`/terminos-y-condiciones`, `/aviso-de-privacidad`, `/envios-y-recoleccion`, `/cambios-y-reembolsos`, texto en `apps/inttimo/src/content/legal/`). Ver `docs/decisions/ADR-002-preventa-stripe.md` y `docs/preventa/README.md`.

- **Actualización 2026-10-01:** la preventa cotiza el envío con **SkyDropX** antes de Stripe (producto + envío en un solo pago) y genera guías desde el panel; recolección con punto elegido (Sophos/Baluarte, Costco). Solo `server/shipping/skydropx.ts` habla con SkyDropX. Ver `docs/preventa/README.md`.
- La excepción cubre **solo la preventa**: `packages/database` (tablas `presale_*`), `apps/inttimo/src/server/presale/`, rutas `/api/preventa/*` y `/api/webhooks/stripe`, y las páginas `/preventa/[slug]` y `/preventa/[slug]/confirmacion`.
- Catálogo, carrito, checkout general, inventario, cuentas y panel operativo de la tienda completa siguen bloqueados por el gate de arriba.
- El frontend de la preventa lo construye un colaborador. El backend es el contrato de `apps/inttimo/src/server/presale/contract.ts`; no romperlo sin avisar.
- Solo `gateway.ts` importa el SDK de Stripe. El precio vive en la base; nunca se acepta del cliente.
- Nunca apuntar migraciones al puerto 54322: lo usa el Supabase local de otro proyecto (AJL-Group).

### Tienda completa: frontend primero, backend por contrato (2026-10-06)

> **Decisión del usuario (2026-10-06):** construir el frontend de las 13 pantallas de la tienda (§8) **sin tocar código de backend**. Lo que el frontend necesita del servidor se pide en un **contrato propuesto** (`apps/inttimo/src/lib/store/contract.ts` + `docs/store/BACKEND-REQUEST.md`) para que el equipo de backend lo implemente después. Mientras tanto la UI funciona con un adaptador simulado (`src/lib/store/mock.ts`, datos marcados como EJEMPLO).

- Todo entra por pull request; nada se fusiona directo a `main`.
- Las rutas de la tienda están ocultas en producción salvo `NEXT_PUBLIC_STORE_ENABLED=1` (la raíz sigue llevando a la preventa).
- Sin precios, paquetes B2B, testimonios ni datos de contacto inventados: lo no aprobado se marca como pendiente.

### Plataforma: Supabase completo (producción real)

> **Decisión del usuario (2026-09-28):** Supabase completo — PostgreSQL + Supabase Auth. Esto es un sistema real, listo para producción y tráfico; el backend de Karina Reyes es una demo y **no** es referencia de arquitectura. Ver `docs/decisions/ADR-003-supabase.md`.

- Drizzle es el ORM y la herramienta de migraciones. El navegador nunca consulta tablas; todo pasa por el servidor.
- **Toda tabla nueva** lleva RLS activado y sin privilegios para `anon`/`authenticated` (test en `packages/database/tests`).
- Panel: Supabase Auth, sin registro público, rol `app_metadata.role = "admin"`.
- Supabase local en puertos 55321–55329 (`supabase start`). PGlite solo en tests.

---

## 2. Material fuente y prioridad

### Archivos fuente

```text
docs/briefs/
└── INTTIMO_Brief_Maestro_Programadores_Ecommerce_SOURCE.docx
```

### Mockups renderizados

```text
docs/mockups/inttimo/
├── 01-home.png
├── 02-para-matrimonios.png
├── 03-productos-tienda.png
├── 04-uno-mas-uno-detalle.png
├── 05-iglesias-ministerios.png
├── 06-filosofia.png
├── 07-carrito.png
├── 08-checkout.png
├── 09-confirmacion-compra.png
├── 10-mi-cuenta.png
├── 11-ayuda-faq.png
├── 12-rastrear-pedido.png
└── 13-contacto-soporte.png
```

### Jerarquía de verdad

1. Instrucción más reciente del usuario.
2. Este `CLAUDE.md`.
3. Brief funcional (`INTTIMO_Brief_Maestro_Programadores_Ecommerce_SOURCE.docx`).
4. Mockups de `docs/mockups/inttimo/` para composición, jerarquía y dirección visual.
5. Convenciones técnicas de este repo.

### Regla sobre mockups

Los mockups **sí deben usarse como referencia visual directa**: proporciones, jerarquía, ritmo, composición, densidad, ubicación aproximada de imágenes, relación texto/fotografía y sensación editorial.

Pero:

- No convertir el mockup completo en una imagen dentro de la web.
- No recrear la página como un "screenshot clickeable".
- Cada elemento debe ser HTML/CSS/React real y responsive.
- No copiar como hechos definitivos precios, fechas, testimonios, teléfonos, correos, nombres ficticios, datos de pago, datos personales o textos de ejemplo que aparezcan en los mockups.
- No publicar contenido ficticio de los renders en producción.
- Las fotografías visibles en los mockups pueden usarse como referencia o placeholder de desarrollo, no como activos finales aprobados.
- Nunca incrustar texto importante dentro de imágenes finales.

---

## 3. Arquitectura de este repositorio

```text
/
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── .gitignore
├── .editorconfig
├── .env.example
│
├── apps/
│   └── inttimo/                 # storefront + e-commerce (inttimo.com o dominio que se decida)
│       ├── src/
│       ├── public/
│       └── ...
│
├── packages/
│   ├── database/                # PostgreSQL + Drizzle ORM: esquema, migraciones y consultas (@inttimo/database)
│   ├── tsconfig/                # config TypeScript estricta compartida (@inttimo/tsconfig)
│   ├── storage/                 # almacenamiento compatible con S3 (@inttimo/storage)
│   ├── shared-utils/            # utilidades genéricas, hoy solo mail.ts (@inttimo/shared-utils)
│   ├── eslint-config/           # reservado, aún vacío
│   └── shared-types/            # reservado, aún vacío
│
└── docs/
    ├── briefs/
    ├── mockups/
    ├── decisions/
    └── preventa/                # contrato de API y operación de la preventa
```

`packages/database` hoy contiene solo el esquema de la preventa. Cuando arranque la tienda completa, ahí se añaden productos, variantes, inventario, pedidos, cupones, territorios, etc. (ver §11 en adelante). No reutilizar el esquema de Karina Reyes — son dominios de datos distintos. Cambios de esquema: editar `packages/database/src/schema/*` → `pnpm db:generate` → `pnpm db:migrate`; las migraciones de producción corren en el build de Vercel (`VERCEL_ENV=production`).

Si en algún momento se decide compartir código de verdad entre este repo y `karina-reyes-ecosyste` (en vez de mantener copias duplicadas), documentarlo en un ADR antes de hacerlo — no improvisar un submódulo o paquete publicado sin decisión explícita.

---

## 4. Stack técnico base

Usar versiones **estables actuales** al momento de implementar. Fijarlas en el lockfile. No adoptar canary/beta/RC salvo que el usuario lo autorice.

### Frontend

- Next.js con App Router.
- TypeScript estricto.
- React.
- Tailwind CSS.
- CSS variables/tokens para el sistema visual (propio de inttimo, no reutilizar tokens de Karina Reyes).
- `next/image` para imágenes.
- `next/font` o fuentes web legales/optimizadas.
- Server Components por defecto.
- Client Components solo donde haya interacción real.
- Animaciones discretas con CSS o Motion cuando aporten valor.

### UI

Priorizar componentes propios y accesibles. Se puede usar Radix/shadcn para primitivas de accesibilidad, pero el sitio no debe verse como un template genérico.

### Formularios

- React Hook Form o alternativa equivalente.
- Zod para validación compartida cliente/servidor.
- Validación real en servidor.
- Rate limiting / antispam.
- Mensajes de error accesibles.

### Calidad

- ESLint, TypeScript `strict`.
- Playwright para flujos E2E importantes.
- Vitest para unidades cuando tenga sentido.
- Axe o equivalente para accesibilidad.

### Paquetes

Usar `pnpm`. No instalar dependencias por moda; cada dependencia nueva debe resolver un problema concreto.

---

## 5. GitHub + Vercel

### GitHub

Repositorio: `Intweb-mx/karina-reyes-ecommerce`.

Estrategia:

- `main` = producción estable.
- `feat/...` = nuevas funciones.
- `fix/...` = correcciones.

Formato de commit recomendado:

```text
feat(inttimo): add cart state
fix(inttimo): correct checkout totals rounding
```

### Vercel

Un proyecto Vercel con Root Directory = `apps/inttimo`, dominio propio de inttimo, variables de entorno, Production + Preview por PR, logs y configuración independientes del proyecto de Karina Reyes.

Nunca compartir secretos de producción con el repo de Karina Reyes salvo necesidad explícita y aprobada.

### Claude Code

1. Leer este `CLAUDE.md` al iniciar.
2. Confirmar que el gate de §1 está satisfecho antes de tocar lógica de negocio.
3. Revisar el mockup de la pantalla que se va a construir.
4. Revisar el brief funcional relacionado.
5. Proponer un plan corto de archivos a tocar.
6. Implementar por componentes.
7. Ejecutar lint/typecheck/tests.
8. Informar qué cambió y qué falta.
9. No iniciar otra gran fase sin cerrar la actual.

---

# PARTE A — inttimo E-COMMERCE

> No construir lógica de negocio real de esta parte hasta que el gate de §1 esté satisfecho.

## 6. Objetivo de inttimo

Construir una plataforma de **marca + contenido + e-commerce** que pueda:

- vender;
- cobrar;
- administrar catálogo;
- controlar inventario;
- crear pedidos;
- automatizar flujo logístico;
- generar/sincronizar guías;
- ofrecer tracking;
- enviar notificaciones;
- permitir administración sin tocar código;
- escalar a nuevos productos físicos/digitales;
- soportar B2B/iglesias;
- soportar cupones/promociones;
- soportar futuras automatizaciones e IA.

La experiencia debe reducir operación manual innecesaria.

---

## 7. Dirección visual de inttimo

Sensación:

- intimidad sofisticada;
- editorial;
- cálida;
- contemporánea;
- limpia;
- no visualmente religiosa en sentido tradicional;
- mucho espacio negativo;
- fotografía real/contextual;
- serif editorial + sans limpia.

Evitar:

- estética sex shop;
- cliché San Valentín;
- terapia clínica;
- clichés de matrimonio;
- saturación de cards;
- exceso de gradientes/sombras;
- UI genérica de marketplace.

inttimo organiza el ecosistema; cada producto puede conservar su universo visual. UNO+UNO conserva identidad propia y no se rediseña arbitrariamente.

---

## 8. Rutas obligatorias de inttimo

```text
/                         Home
/para-matrimonios         Para matrimonios
/productos                 Productos / tienda
/productos/uno-mas-uno    UNO+UNO detalle
/iglesias                  Iglesias y ministerios
/filosofia                 Nuestra filosofía
/carrito                    Carrito
/checkout                   Checkout
/pedido/confirmado         Confirmación
/cuenta                     Mi cuenta
/ayuda                      Ayuda / FAQ
/rastrear-pedido           Tracking
/contacto                   Contacto / soporte
```

Usar los 13 mockups de `docs/mockups/inttimo/` como guía visual.

---

## 9. Navegación global de inttimo

Header conceptual:

- inttimo;
- Para matrimonios;
- Productos;
- Para iglesias;
- Nuestra filosofía;
- Recursos cuando exista contenido suficiente;
- búsqueda;
- cuenta;
- carrito con contador en tiempo real;
- CTA tienda.

Footer:

- navegación;
- contacto;
- ayuda;
- políticas;
- redes;
- privacidad;
- términos;
- envíos/devoluciones;
- copyright.

Header/footer deben ser globales y administrables cuando se conecte CMS/e-commerce.

---

## 10. Plataforma e-commerce — regla de arquitectura

No construir un ERP completo desde cero si una plataforma e-commerce madura resuelve de forma segura catálogo, órdenes, inventario, clientes, promociones y operaciones.

Antes de implementar backend productivo, documentar una decisión en:

```text
docs/decisions/ADR-ECOMMERCE-PLATFORM.md
```

Evaluar como mínimo:

- operación en México;
- Mercado Pago;
- SkyDropX;
- soporte para headless;
- inventario;
- SKUs/variantes;
- cupones;
- webhooks;
- roles;
- auditoría;
- exportaciones;
- costos recurrentes;
- facilidad de administración;
- escalabilidad;
- portabilidad de datos.

La UI de Next.js debe hablar con servicios/adaptadores y no quedar acoplada de manera irreversible a un proveedor cuando sea evitable.

---

## 11. Modelo de producto

Cada producto/variante debe contemplar como mínimo:

```text
id
sku
name
slug
status
type: physical | digital
price
compareAtPrice?
cost?
taxConfiguration
inventory
oversellPolicy
weight
dimensions
images[]
description
richContent
visualAccent
seo
categories[]
territories[]
tags[]
relatedProducts[]
```

Para bundles/paquetes de iglesias:

- SKU propio o bundle formal;
- inventario consistente;
- no simular bundle solo multiplicando items en frontend si rompe stock/facturación/fulfillment.

---

## 12. Inventario — versión mejorada

No mostrar solo un número de stock. Modelar:

```text
onHand
reserved
available
incoming?
lowStockThreshold
status
```

Estados: disponible, stock bajo, agotado, preventa/backorder solo si el negocio lo autoriza.

Movimientos auditables: recepción, venta, reserva, liberación de reserva, cancelación, devolución, ajuste manual, corrección, transferencia futura si existen almacenes.

Registrar:

```text
movementId
sku
quantityDelta
reason
orderId?
userId?
timestamp
notes?
```

### Concurrencia

Evitar doble venta. Definir política explícita de: reserva temporal durante checkout si la plataforma lo soporta, liberación por expiración, decremento definitivo al confirmar pago según plataforma, idempotencia.

---

## 13. Carrito

Debe soportar: persistencia, invitado, cantidades, eliminar, actualizar, promociones, cupones, estimación de envío si aplica, productos relacionados sin interrumpir compra, validación de stock antes de checkout, actualización segura de totales en servidor.

Nunca confiar en precios calculados solo en cliente.

---

## 14. Checkout

Requisitos: compra como invitado, cuenta opcional, capturar solo datos necesarios, contacto, dirección, método de envío, pago, resumen, totales definitivos, errores claros, idempotencia, validación servidor, aceptación de políticas cuando corresponda, consentimiento de marketing separado.

No guardar números completos de tarjeta, CVV ni datos sensibles de pago.

---

## 15. Mercado Pago

> **Actualización 2026-09-28:** la preventa usa **Stripe** por decisión del usuario (ADR-002). Para la tienda completa la pasarela está pendiente de decidir (Stripe o Mercado Pago); no integrar Mercado Pago sin confirmarlo. Las reglas de abajo (webhooks verificados, idempotencia, reconciliación, nunca confiar en la URL de éxito) aplican a cualquier pasarela.

Integración objetivo original: **Mercado Pago**.

Reglas:

- la cuenta debe ser propiedad del cliente;
- los pagos deben llegar directamente a la cuenta del cliente;
- secretos solo en servidor;
- usar SDK/API oficial vigente al momento de implementar;
- revisar documentación oficial antes de integrar;
- webhooks firmados/verificados;
- idempotencia;
- reconciliación de estados;
- nunca considerar "pagado" solo porque el navegador regresó a una URL de éxito.

Estados de pago mínimos:

```text
pending
authorized
paid
failed
cancelled
refunded
partially_refunded
```

Guardar referencia externa, no datos completos de tarjeta.

### Flujo esperado

```text
Checkout
  -> validar carrito/stock
  -> crear intento de orden/pago
  -> Mercado Pago
  -> webhook verificado
  -> reconciliar pago
  -> confirmar pedido una sola vez
  -> confirmar/decrementar stock
  -> iniciar fulfillment
  -> notificar
```

Manejo obligatorio de: webhook duplicado, webhook fuera de orden, pago pendiente, rechazo, usuario cierra navegador, reembolso, reembolso parcial, timeout, reintento.

---

## 16. SkyDropX

Integración objetivo: **SkyDropX** para logística en México.

La integración debe poder: cotizar envíos, recibir múltiples opciones, filtrar por paqueterías autorizadas, considerar destino/origen/peso/dimensiones/disponibilidad, crear envío, generar etiqueta/guía, guardar carrier/servicio/número de guía/costo/URL de etiqueta/tracking, recibir/sincronizar eventos, manejar incidencias.

Usar API/documentación oficial vigente al momento de implementación. No codificar nombres/IDs de servicios sin configuración administrable.

---

## 17. Motor de selección de envío

No limitar la tienda a "siempre el más barato". Estrategia configurable:

```text
CHEAPEST
FASTEST
BALANCED
MANUAL_CUSTOMER_CHOICE
```

- **CHEAPEST**: menor costo entre carriers permitidos.
- **FASTEST**: menor tiempo estimado entre carriers permitidos.
- **BALANCED**: función configurable que considera costo, ETA, confiabilidad si existe dato válido, restricciones del negocio. No inventar métricas de confiabilidad si el proveedor no las ofrece.
- **MANUAL_CUSTOMER_CHOICE**: mostrar alternativas aprobadas al cliente.

Admin debe permitir configurar paqueterías: todas las disponibles, lista permitida, lista bloqueada, reglas por región si se requieren.

### Fallback

Si no existe tarifa válida: no romper checkout, mostrar mensaje claro, permitir contacto/soporte o flujo alterno aprobado, registrar error técnico para diagnóstico.

---

## 18. Flujo automático de fulfillment

```text
Pago aprobado
  -> pedido confirmado
  -> stock definitivo
  -> seleccionar/cotizar envío según regla
  -> crear shipment
  -> generar guía/etiqueta
  -> guardar tracking
  -> poner pedido en preparación
  -> notificar al equipo/cliente según regla
```

Permitir un modo de **aprobación manual** por configuración para casos donde el negocio no quiera comprar/generar guía automáticamente.

Estados logísticos sugeridos:

```text
confirmed
preparing
label_generated
handed_to_carrier
in_transit
out_for_delivery
delivered
exception
return_in_progress
returned
```

No inventar tracking en tiempo real. Mostrar solo datos recibidos del proveedor/logística.

---

## 19. Tracking

Ruta: `/rastrear-pedido`.

Acceso seguro por sesión autenticada, o combinación de folio + email y medidas anti-enumeración. Nunca exponer pedido privado solo con un ID secuencial fácil de adivinar.

Mostrar: folio, carrier, guía, estado, ETA si existe, eventos reales, fecha/hora, productos básicos del pedido, soporte ante incidencia.

---

## 20. Pedidos

Cada pedido debe guardar:

```text
orderNumber
customerId?
guestEmail?
createdAt
items[]
skus[]
quantities[]
subtotal
discounts
taxes
shipping
total
paymentMethod
paymentStatus
shippingAddress
billingAddress?
fulfillmentStatus
shipmentId?
trackingNumber?
internalNotes
events[]
source
utm?
```

El administrador debe poder buscar, filtrar, ver detalle, exportar, imprimir documentos necesarios, cancelar según permisos, reembolsar según permisos, registrar incidencias, reintentar notificaciones cuando sea seguro, ver timeline completo.

Nunca borrar el historial de eventos para "limpiar" un pedido.

---

## 21. Timeline / event log del pedido

Registro append-only o equivalente:

```text
ORDER_CREATED
PAYMENT_PENDING
PAYMENT_APPROVED
PAYMENT_FAILED
INVENTORY_RESERVED
INVENTORY_COMMITTED
INVENTORY_RELEASED
SHIPPING_QUOTED
SHIPMENT_CREATED
LABEL_GENERATED
HANDED_TO_CARRIER
IN_TRANSIT
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
REFUND_REQUESTED
REFUNDED
EXCEPTION
```

Cada evento:

```text
id
orderId
type
source
actorId?
externalRef?
metadata
timestamp
```

La metadata no debe guardar secretos ni información de pago sensible.

---

## 22. Panel administrativo de inttimo

Idealmente aprovechar panel de plataforma e-commerce madura y extender solo donde haga falta.

Capacidades requeridas directa o vía integración:

```text
Dashboard
Productos
Variantes / SKUs
Categorías / territorios
Precios
Inventario
Clientes
Pedidos
Pagos
Reembolsos
Envíos
Tracking
Cupones
Promociones
Cotizaciones B2B
Contenido CMS
FAQs
Banners / CTAs
Testimonios
Reportes
Configuración
Roles / permisos
Auditoría
```

Dashboard básico con métricas reales, no inventadas: ventas del periodo, número de pedidos, ticket promedio, productos más vendidos, stock bajo, pedidos por estado, costo de envío cuando exista dato, cupones utilizados. Conversión y carritos abandonados solo si la instrumentación permite medirlos de forma fiable.

---

## 23. Cupones, promociones y descuentos

Soportar gradualmente: porcentaje, monto fijo, envío gratis, producto específico, categoría, bundle, descuento por volumen, B2B/iglesias, fecha inicio/fin, límite total, límite por cliente, compra mínima, combinabilidad configurable.

Validar en servidor.

---

## 24. Iglesias / B2B

Ruta: `/iglesias`.

Dos caminos: compra directa de paquetes reales aprobados, o solicitud de cotización.

Formulario de cotización mínimo:

```text
organization
contactName
email
phone?
city
approximateQuantity
eventDate?
intendedUse
message
consent
```

Panel debe poder: recibir lead, asignar estado, guardar notas, contactar, crear cotización si se implementa módulo, convertir cotización a pedido de forma controlada.

No publicar precios/paquetes B2B ficticios.

---

## 25. Mi cuenta

Mínimo: autenticación segura, historial de pedidos, detalle, tracking, direcciones, datos personales, preferencias de comunicación, cierre de sesión.

Compra como invitado siempre posible salvo nueva decisión de negocio. Métodos de pago guardados solo si el proveedor los tokeniza y el negocio lo aprueba. Wishlist: fase posterior, no requisito inicial.

---

## 26. Notificaciones

Preparar templates transaccionales para: pedido recibido, pago confirmado, pago fallido cuando corresponda, pedido en preparación si se usa, guía generada, pedido enviado, incidencia relevante, en reparto si existe evento fiable, entregado, cancelación, reembolso, newsletter, entrega de recurso digital si aplica.

Reglas: usar proveedor aprobado, separar transaccional de marketing, marketing requiere consentimiento, nunca suscribir por comprar automáticamente, idempotencia para no mandar correos duplicados de eventos repetidos.

---

## 27. CMS de inttimo

Contenido administrable mínimo:

### Products

producto, variantes, SKU, precio, stock, imágenes, contenido, SEO, estado.

### Territories

Territorios iniciales del brief: conversación, conexión, intimidad, disfrute, conocimiento mutuo, fe/propósito. Relación muchos-a-muchos con productos/recursos cuando corresponda.

### Resources

tipo, título, archivo/URL, acceso, portada, copy, SEO, estado.

### FAQs

pregunta, respuesta, categoría, orden, estado.

### Testimonials

texto, nombre/contexto, producto, aprobación, estado.

### Banners / CTAs

copy, imagen, destino, fechas, estado.

### Churches / B2B

paquetes aprobados, beneficios, formularios/cotizaciones.

### Policies

envíos, cambios/devoluciones, privacidad, términos.

---

## 28. SEO y analítica de inttimo

SEO: metadata administrable, canonical, Open Graph, sitemap, Product/Offer solo con datos reales, Organization, BreadcrumbList, FAQPage cuando corresponda y sea válido, 301 administrables.

Analítica mínima:

```text
view_item
add_to_cart
remove_from_cart
view_cart
begin_checkout
add_shipping_info
add_payment_info
purchase
search
signup
contact
quote_request
```

Preservar UTM/atribución cuando sea viable y legal. El evento `purchase` debe evitar duplicados. Nunca incluir datos sensibles/PII en eventos analíticos.

---

## 29. Facturación

Opcional, depende de requisitos finales del cliente. No inventar PAC/proveedor. Si se aprueba: definir RFC/datos requeridos, flujo de solicitud, integración, generación/descarga, relación con pedido, cancelaciones, seguridad, auditoría. Mantenerlo como módulo desacoplado.

---

## 30. IA — fase posterior

No bloquear lanzamiento por IA.

### IA para cliente

Preguntas sobre productos, FAQs, políticas, funcionamiento, envíos, orientación hacia recursos, seguimiento de pedido solo después de autenticar/verificar correctamente al cliente.

La IA debe alimentarse con información aprobada del negocio. No debe inventar: stock, precios, descuentos, fechas de entrega, políticas, estado de pedidos. Para datos transaccionales debe consultar herramientas/servicios reales.

### IA para administrador

Consultas de lectura ("productos con stock bajo", "pedidos sin guía", "resume ventas del periodo", "borrador de SEO"). Por defecto IA = **read + suggest**. Acciones sensibles (cambiar precio/stock, publicar/borrar producto, cancelar pedido, reembolsar, modificar datos de cliente, cambiar configuración de pago/envío) requieren confirmación explícita. Registrar acciones ejecutadas por IA/administrador.

---

## 31. Seguridad

Secrets solo servidor, `.env` nunca en Git, `.env.example` sin secretos, CSP cuando sea viable, secure headers, protección CSRF según arquitectura, rate limiting, validación/sanitización, webhooks verificados, permisos por rol, least privilege, no guardar datos completos de tarjeta, logs sin secretos, backups definidos, auditoría de operaciones críticas, endpoints privados autenticados, protección contra enumeración de pedidos, dependencias auditadas.

---

## 32. Privacidad y legal

Antes de producción deben existir contenidos aprobados para: aviso de privacidad, términos, envíos, cambios/devoluciones, cookies/pixels según implementación, marketing consent, datos de contacto.

No redactar ni publicar como definitivo un texto legal sin aprobación correspondiente.

---

## 33. Estados y errores de inttimo

Diseñar/programar: carrito vacío, agotado, stock bajo, pago rechazado, pago pendiente, dirección inválida, dirección no servida, error de cotización de envío, sin paqueterías disponibles, pedido cancelado, reembolso, tracking sin eventos, incidencia de entrega, 404, 500, mantenimiento, formulario enviado/error, búsqueda sin resultados, cuenta sin pedidos, webhook retrasado, guía no generada, servicio externo temporalmente no disponible.

Nunca ocultar un fallo operativo crítico con un mensaje de "todo salió bien".

---

## 34. Testing del e-commerce

Antes de producción probar en sandbox/staging:

### Compra

invitado, usuario autenticado, 1 producto, varios productos, cupón válido, cupón inválido, stock límite, stock agotado, pago aprobado, pago rechazado, pago pendiente, webhook duplicado, reintento.

### Envío

múltiples tarifas, carrier permitido, carrier bloqueado, cheapest, fastest, balanced, sin tarifa, generación de guía, error de guía, tracking, evento duplicado, incidencia.

### Pedido

creación única, total correcto, descuento correcto, inventario correcto, timeline correcto, cancelación, reembolso, permisos.

### UI

desktop, tablet, mobile, teclado, screen reader basics, errores, loaders, Core Web Vitals.

---

## 35. Criterios de aceptación de inttimo

No considerar listo hasta que: compra end-to-end pase en sandbox/staging; un pago genere un solo pedido; inventario sea consistente; no se venda stock inexistente según política; admin gestione productos/stock/pedidos sin tocar código; guía/tracking se genere o sincronice según integración aprobada; cliente reciba notificaciones correctas; tracking use datos reales; responsive esté probado; formularios y checkout manejen errores; analítica no duplique purchase; contenido ficticio del mockup esté eliminado; backups/roles/staging/production estén definidos; secretos no estén en repositorio.

---

# PARTE B — REGLAS DE IMPLEMENTACIÓN PARA CLAUDE CODE

## 36. Antes de tocar código

Siempre: identificar si el gate de §1 permite el trabajo pedido; leer mockup correspondiente; leer sección funcional correspondiente; inspeccionar componentes existentes; evitar duplicar patrones; explicar brevemente el plan; implementar la unidad más pequeña coherente.

No rehacer archivos completos si un cambio pequeño basta.

---

## 37. Componentización

Crear componentes por responsabilidad, no por cada `div`.

```text
components/
├── layout/
├── product/
├── cart/
├── checkout/
├── account/
├── tracking/
├── b2b/
└── ui/
```

No crear un componente universal monstruoso con decenas de flags.

---

## 38. Datos y contenido

Nunca mezclar contenido hardcodeado profundamente con layout.

Durante mockup phase usar fixtures tipadas (`src/content/`, `src/data/`). Después conectar adaptador CMS/e-commerce elegido (ver §10).

Estados explícitos: `DRAFT`, `PUBLISHED`, `ARCHIVED`.

Cuando un dato del mockup no esté aprobado, marcar en datos de desarrollo como placeholder y no como verdad de negocio.

---

## 39. Responsive

Mobile-first. Breakpoints deben responder al contenido, no solo copiar defaults. Revisar al menos: 375px, 430px, 768px, 1024px, 1280px, 1440px o superior para comparar con mockup desktop.

Evitar: texto desbordado, botones cortados, grids imposibles en móvil, imágenes deformadas, alturas fijas excesivas, `100vh` problemático en móvil sin considerar viewport dinámico.

---

## 40. Diseño visual y tokens

Tokens propios en `styles/tokens.css`: background, foreground, muted, border, accent, font-serif, font-sans, spacing, max-width, radius, shadow si se usa, motion duration/easing.

No usar valores aleatorios diferentes en cada componente. No reutilizar los tokens visuales de Karina Reyes: son marcas distintas.

---

## 41. Imágenes y assets

Los archivos en `docs/mockups/` no son assets de producción, son referencias visuales.

Assets de producción en `apps/inttimo/public/images/`. Cuando se reciban fotos aprobadas: conservar originales fuera de procesamiento cuando sea útil, generar versiones web optimizadas, no sobrescribir masters, nombres descriptivos (`inttimo-uno-mas-uno-black.webp`, no `IMG_1234.jpg`).

---

## 42. No inventar

Claude Code NO debe inventar como si fuera real: precios, promociones, testimonios, dirección, teléfono, correos, fechas, nombres de clientes, inventario, SKUs, GTIN, políticas, tiempos de entrega, paqueterías habilitadas, métodos de pago habilitados, cuentas de Mercado Pago, llaves API, datos de facturación, tracking, estadísticas.

Si hace falta contenido para construir layout, usar placeholders inequívocos y centralizados.

---

## 43. Variables de entorno

`.env.example` con nombres, nunca secretos. Los nombres definitivos pueden cambiar según SDK/proveedor vigente. No poner credenciales reales en documentación, commits, issues ni screenshots.

---

## 44. Documentar decisiones

Para decisiones grandes crear ADRs en `docs/decisions/`:

```text
Contexto
Decisión
Alternativas consideradas
Consecuencias
Estado
Fecha
```

---

## 45. Definition of Done por tarea

Antes de decir "terminado": compila; typecheck pasa; lint pasa; tests relevantes pasan; no hay errores de consola evitables; no hay secretos; responsive fue revisado; accesibilidad básica fue revisada; no se rompieron rutas existentes; mockup fue comparado cuando aplique; cambios están resumidos.

Si no se pudo ejecutar algo, decir exactamente qué no se verificó.

---

## 46. Comandos esperados del repo

```bash
pnpm dev
pnpm dev:inttimo
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm supabase:start    # Supabase local (puertos 55321–55329)
pnpm admin --create --email=...   # administradores del panel (también --reset-mfa, --revoke, --list)
pnpm db:generate
pnpm db:migrate
pnpm presale:upsert --file=...    # crear/editar campaña de preventa
pnpm presale:export --slug=...    # CSV de reservas
pnpm presale:reconcile            # sincronizar con Stripe si falló un webhook
```

---

## 47. Qué NO hacer mientras el gate de §1 no esté satisfecho

No: conectar Mercado Pago; conectar SkyDropX; crear un ERP; inventar base de datos final sin ADR; llenar la web con lorem ipsum desordenado; usar los screenshots como páginas; usar un template genérico y "maquillarlo"; agregar features no solicitadas antes de cerrar lo esencial.

---

## 48. Checklist rápido — cada sesión

```text
[ ] Confirmé que el gate de aprobación (§1) sigue vigente o fue levantado explícitamente.
[ ] Leí el mockup de la pantalla actual.
[ ] Leí el brief funcional relacionado.
[ ] No estoy inventando datos finales.
[ ] Mantengo estética editorial de inttimo, no la de Karina Reyes.
[ ] Lo que hago funciona en móvil.
[ ] Antes de cerrar voy a ejecutar checks.
```
