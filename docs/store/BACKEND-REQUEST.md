# Tienda inttimo: solicitud de backend

**Para:** backend (Leo) · **De:** frontend · **Fecha:** 6 de octubre de 2026 · **Estado:** solicitud abierta

El frontend de las 13 pantallas de la tienda (CLAUDE.md §8) ya está construido y funciona con un **adaptador simulado**. Este documento enumera lo que el backend necesita implementar para que la tienda funcione de verdad. El contrato en TypeScript está en `apps/inttimo/src/lib/store/contract.ts`; es una propuesta, y cualquier cambio se puede acordar antes de implementarlo.

Cada endpoint indica entre paréntesis el método de `StoreApi` que lo usa (`apps/inttimo/src/lib/store/api.ts`).

## Cómo se conecta

1. Implementar los endpoints bajo `/api/tienda/*`. El adaptador HTTP (`src/lib/store/http.ts`) ya los llama con estas rutas exactas.
2. Poner `NEXT_PUBLIC_STORE_API=http` en el entorno. Las pantallas no cambian.
3. Para mostrar la tienda en producción, poner `NEXT_PUBLIC_STORE_ENABLED=1`. Mientras tanto, todas las rutas de la tienda responden 404 en producción y `/` sigue llevando a la preventa.

Convenciones iguales a la preventa: montos en **centavos**, fechas ISO, errores con la forma `{ error: { code, message, fieldErrors? } }`, cabecera `Idempotency-Key` en compras y campo trampa `website`. El navegador nunca envía precios.

## Endpoints

| # | Método y ruta | Pantalla | Qué hace |
|---|---|---|---|
| 1 | `GET /api/tienda/productos` (`catalog`) | Inicio, Productos, Para matrimonios | Catálogo publicado: `ProductSummary[]` con estado (`available`, `low_stock`, `sold_out`, `presale`, `coming_soon`), precio y territorios. |
| 2 | `GET /api/tienda/productos/[slug]` (`product`) | Detalle de UNO+UNO | `ProductDetail`: galería, contenido, cómo se juega, preguntas frecuentes, máximo por pedido, relacionados y SEO. 404 si no está publicado. |
| 3 | `POST /api/tienda/carrito/cotizar` (`quoteCart`) | Carrito, Checkout | Recibe `{ productId, quantity }[]` y un cupón opcional. Devuelve precios, subtotales, descuento, `couponError` y el total **calculado en el servidor**. Ajusta la cantidad según el stock y lo explica en `notice`. |
| 4 | `GET /api/tienda/entrega` (`deliveryOptions`) | Checkout | Métodos de entrega activos, puntos de recolección y la **versión vigente de los Términos** (`termsVersion`). |
| 5 | `POST /api/tienda/envio/cotizar` (`quoteShipping`) | Checkout | Cotización de SkyDropX para todo el carrito, con la misma lógica que `/api/preventa/[slug]/envio`. Devuelve `quoteId`, `expiresAt` y las opciones económica y express. Con límite de intentos. |
| 6 | `POST /api/tienda/checkout` (`checkout`) | Checkout | Valida carrito, stock, cotización (`quoteId` + `rateId` + código postal + cantidad) y términos. Crea el pedido pendiente y la sesión de Stripe Checkout. Devuelve `orderNumber` y `checkoutUrl`. Idempotente. |
| 7 | `GET /api/tienda/pedido/confirmacion?session_id=…` (`orderConfirmation`) | Pedido confirmado | `OrderView` al regresar de Stripe. Nunca marcar como pagado solo porque el navegador regresó: depender del webhook y de la reconciliación. |
| 8 | `POST /api/tienda/rastrear` (`trackOrder`) | Rastrear pedido | Número de pedido **y** correo. Misma respuesta si no coinciden (anti-enumeración), con límite de intentos. Solo eventos reales de la paquetería y del panel. |
| 9 | `POST /api/tienda/cuenta/acceso` (`requestAccountAccess`) | Mi cuenta | Envía un enlace de acceso (Supabase Auth). Misma respuesta exista o no la cuenta. |
| 10 | `GET /api/tienda/cuenta` (`account`) | Mi cuenta | `AccountView` (pedidos, direcciones, preferencias) de la sesión, o `null` si no hay sesión. |
| 11 | `POST /api/tienda/contacto` (`contact`) | Contacto | Formulario de contacto con tema, antispam y límite de intentos. Manda un correo al equipo (y un ticket o CRM si se decide después). |
| 12 | `POST /api/tienda/iglesias/cotizacion` (`churchQuote`) | Iglesias | Solicitud B2B (brief §24). Se guarda con un estado en el panel y se avisa al equipo. |
| 13 | `POST /api/tienda/newsletter` (`newsletter`) | Pie de página (todas) | Doble confirmación con consentimiento explícito. Nunca suscribir a alguien por comprar. |
| 14 | `GET /api/tienda/codigo-postal/[cp]` (`lookupPostalCode`) | Checkout | **Nuevo.** Con el código postal devuelve estado, municipio y colonias (catálogo SEPOMEX o el de SkyDropX). El checkout los llena solo y sugiere la colonia, así la persona escribe menos. 404 si el código no existe; entonces el checkout deja escribir a mano. |

## Panel de la tienda (nuevo)

Las pantallas ya están construidas en `/panel/tienda` con datos simulados (`src/lib/store/admin-mock.ts`). El contrato está en `apps/inttimo/src/lib/store/admin-contract.ts`, y el adaptador HTTP en `src/lib/store/admin.ts` ya llama a estas rutas.

Reglas para **todas** estas rutas:

- Solo administradores (`requireAdmin`, con MFA).
- Cada acción queda en la bitácora del panel.
- Errores con la misma forma que la tienda.

| # | Método y ruta | Pantalla | Qué hace |
|---|---|---|---|
| A1 | `GET /api/panel/tienda/resumen?periodo=7d\|30d\|all` | Resumen | Ventas pagadas, pedidos, ticket promedio, pedidos por enviar y por recoger, incidencias, productos con poco inventario, solicitudes nuevas y más vendidos. Solo métricas reales. |
| A2 | `GET /api/panel/tienda/pedidos?filtro=…&q=…&pagina=…` | Pedidos | Lista con conteos por filtro (`to_ship`, `to_pickup`, `in_transit`, `exception`, `delivered`, `unpaid`, `all`). Busca por folio, nombre, correo o guía. Primero va lo que espera acción, del más antiguo al más reciente. |
| A3 | `GET /api/panel/tienda/pedidos/exportar?filtro=…&q=…` | Pedidos | CSV con el filtro actual, en UTF-8 con BOM para que Excel muestre bien los acentos. |
| A4 | `GET /api/panel/tienda/pedidos/[folio]` | Detalle | `AdminOrderDetail`: datos del cliente, entrega, guía, notas internas, la bitácora completa (solo se agrega, nunca se borra) y `allowedActions`. **El backend decide qué acciones caben en cada estado**; el panel solo muestra esas. |
| A5 | `POST /api/panel/tienda/pedidos/[folio]/acciones` (`Idempotency-Key`) | Detalle | Acciones: generar guía (SkyDropX, igual que en la preventa), marcar enviado, listo para recoger (con correo al cliente), entregado, reportar incidencia con nota, reenviar confirmación y cancelar (reembolso en Stripe si ya se pagó). Devuelve el pedido actualizado. |
| A6 | `POST /api/panel/tienda/pedidos/[folio]/notas` | Detalle | Nota interna que el cliente nunca ve. |
| A7 | `GET /api/panel/tienda/productos` · `PATCH /api/panel/tienda/productos/[id]` | Productos | Lista con inventario (`onHand`, `reserved`, `available`, `lowStockThreshold`). El PATCH edita precio (en centavos), publicar u ocultar, aviso de poco inventario y máximo por pedido. |
| A8 | `POST /api/panel/tienda/productos/[id]/inventario` · `GET …/movimientos` | Productos | Entradas y salidas con motivo (recepción, ajuste, merma, devolución, corrección). Es un **movimiento auditable**, nunca se sobrescribe el número. Las existencias no pueden quedar debajo de lo apartado. Cada movimiento guarda dos cambios: `deltaOnHand` (existencias) y `deltaReserved` (apartado en pedidos). |
| A9 | `GET /api/panel/tienda/solicitudes` · `PATCH /api/panel/tienda/solicitudes/[id]` | Solicitudes | Contacto y cotizaciones de iglesias, con estado (`new`, `contacted`, `quoted`, `won`, `closed`) y notas del equipo. |

## Modelo de datos necesario (brief §11–§21)

- **Productos y variantes:** SKU, tipo `physical`/`digital`, precio, precio anterior, estado, peso y dimensiones (para SkyDropX), imágenes, territorios (muchos a muchos), SEO y máximo por pedido.
- **Inventario:** `onHand`, `reserved`, `available` y `lowStockThreshold`, con **movimientos auditables** (venta, reserva, liberación, ajuste, devolución). Sin sobreventa: reservar durante el checkout y confirmar al pagar.
- **Pedidos:** número `INT-…` (no secuencial ni adivinable), líneas, subtotal, descuento, envío, total, estado del pago y de la entrega (`FulfillmentStatus` del contrato), método de entrega, dirección o punto de recolección, envío con guía y una **bitácora que solo se agrega, nunca se borra**.
- **Cupones:** validados en el servidor, con fechas, límites y compra mínima. El frontend ya tiene el campo y muestra `couponError`.
- **Clientes:** cuentas opcionales. Comprar como invitado debe seguir siendo posible.
- **Solicitudes:** contacto y cotizaciones de iglesias, cada una con un estado en el panel.

## Pendiente para una siguiente fase del panel

- Fotos y textos de productos desde el panel.
- Preguntas frecuentes, costo de envío y paqueterías permitidas, configurables sin tocar código.
- Cupones.

## Lo que el frontend ya resuelve sin backend

Estas mejoras no requieren nada del backend:

- **Carrito lateral** al agregar un producto.
- **Barra de compra fija** en celular.
- **Pasos de la compra:** carrito, datos, pago y confirmación.
- **Transiciones suaves** entre páginas.
- **Envío automático:** se cotiza solo en cuanto la dirección está completa.
- **Datos recordados** para la próxima compra, solo en el navegador de la persona y con su permiso.

## Decisiones de negocio pendientes (no son de frontend)

1. **Precio de tienda** de UNO+UNO. El simulador usa los $500 de la preventa.
2. **Términos y Condiciones de la tienda.** Los actuales están escritos para la preventa, por eso el checkout enlaza a ellos de forma genérica por ahora.
3. **Paquetes y precios para iglesias.** No se publica ningún precio; solo solicitudes de cotización.
4. **Proveedor del newsletter** y de los correos de la tienda.
5. **Fotos y textos oficiales.** Las imágenes son renders de referencia, marcados como "Foto de referencia" en desarrollo.

## Si hay que cambiar el contrato

Si algún campo o endpoint debe cambiar, editar `contract.ts` en el mismo PR que el endpoint y actualizar el simulador (`mock.ts`) para que la interfaz siga funcionando. TypeScript señala cualquier pantalla que haya que ajustar.
