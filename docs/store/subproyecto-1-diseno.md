# Backend de la tienda — Subproyecto 1: base de datos e inventario

- **Estado:** aprobado por el usuario (2026-10-07)
- **Pide:** `docs/store/BACKEND-REQUEST.md` y `apps/inttimo/src/lib/store/contract.ts` + `admin-contract.ts` (Alan, PR #20)
- **Alcance elegido por el usuario:** todo lo que pidió Alan, antes de abrir la tienda al público.
- **Depende de:** PR #19 (migración 0009). La rama parte de `feat/panel-por-hacer` para no chocar en el registro de migraciones.

## Plan general (subproyectos)

| # | Subproyecto | Estado |
|---|---|---|
| 0 | Poner al día el PR #19 con `main` | hecho |
| 1 | Base de datos e inventario (este documento) | diseño aprobado |
| 2 | Catálogo y carrito (`/api/tienda/productos`, `/carrito/cotizar`) | pendiente |
| 3 | Entrega, envío y código postal (`/entrega`, `/envio/cotizar`, `/codigo-postal`) | pendiente |
| 4 | Checkout, Stripe y webhook (`/checkout`, `/pedido/confirmacion`) | pendiente |
| 5 | Pedidos de la tienda en el panel, con reembolsos y cancelación | pendiente |
| 6 | Productos e inventario en el panel | pendiente |
| 7 | Rastreo, cuenta, contacto, iglesias y newsletter | pendiente |
| 8 | Resumen del panel | pendiente |

## Decisión: pedidos en tablas nuevas

Los pedidos de la tienda viven en tablas `store_*`, separadas de `presale_*`. La preventa tiene dinero real y sigue abierta hasta el 15 de octubre de 2026, y una reserva es de un solo producto mientras el carrito de la tienda trae varias líneas. Se comparte el código de Stripe, SkyDropX y correos; el panel muestra ambos tipos de pedido.

## Tablas

Todas con RLS activado y sin privilegios para `anon`/`authenticated`.

| Tabla | Contenido |
|---|---|
| `store_products` | slug, SKU, nombre, tipo (`physical`/`digital`), precio y precio anterior en centavos (pueden ser nulos), estado de venta (`coming_soon`, `presale`, `on_sale`), publicado, máximo por pedido, peso y medidas, territorios, umbral de stock bajo |
| `store_inventory` | por producto: `on_hand` y `reserved`. Disponible = `on_hand − reserved`. Restricción: `on_hand ≥ reserved ≥ 0` |
| `store_stock_movements` | `delta_on_hand`, `delta_reserved`, motivo (`reception`, `adjustment`, `damage`, `return`, `correction`, `sale`, `reservation`, `release`), pedido, autor, nota. Append-only |
| `store_orders` | folio `INT-…` no secuencial, estado de pago y de entrega (valores del contrato), cliente, entrega, subtotal, descuento, envío, total (restricción: suma correcta), clave de idempotencia, datos de Stripe, guía, atribución |
| `store_order_items` | líneas con nombre, SKU y precio copiados al momento de la compra |
| `store_order_events` | historial del pedido. Append-only |
| `store_order_notes` | notas internas. Append-only |

Sin variantes por ahora (el contrato no las usa). Fuera de este subproyecto: clientes y direcciones, solicitudes de contacto e iglesias, términos de la tienda y cupones.

**Sin precios inventados:** UNO+UNO se carga sin precio, como `coming_soon` y con 0 existencias. El precio de tienda está pendiente de Karina y se fija después desde el panel. Los textos, galería, "cómo se juega" y preguntas frecuentes siguen en los archivos de contenido de Alan; la base guarda solo lo comercial.

## Manejo del stock

Misma lógica que la preventa (sin sobreventa), extendida a varias líneas por pedido.

1. **Inicio del checkout:** en una transacción se bloquean los productos del carrito en orden fijo (evita bloqueos cruzados) y se revisa lo disponible. Si falta, error `out_of_stock` con lo que queda. Si alcanza: se crea el pedido, sube `reserved` y se anota un movimiento `reservation`. Luego se crea la sesión de Stripe (30 minutos, el mínimo de Stripe). Si Stripe falla, se libera todo.
2. **Pago confirmado (webhook):** el pedido pasa a pagado, bajan `on_hand` y `reserved`, se anota `sale`. El correo de confirmación sale una vez. Un webhook repetido no hace nada.
3. **Pago que no llega:** al vencer la sesión (más 5 minutos de gracia) se libera lo apartado y se anota `release`. Se libera también al calcular lo disponible, sin depender de un proceso programado. Habrá un comando de reconciliación con Stripe como el de la preventa.
4. **Ajuste manual (panel):** entrada o salida con motivo obligatorio. Se rechaza si `on_hand` quedaría por debajo de `reserved`.
5. **Cancelar o reembolsar:** devuelve el stock solo si el pedido no se había enviado. Se diseña en el subproyecto 5.
6. **Pago que llega tras liberar el apartado:** se intenta apartar de nuevo. Si no hay stock, el pedido queda pagado y marcado como excepción, con aviso en el panel para reembolsarlo. Nunca se vende lo que no existe ni se pierde un pago en silencio.

## Ajuste al contrato de Alan

`StockMovement` (en `admin-contract.ts`) trae un solo `delta`. Con dos cambios (existencias y apartado) un movimiento `reservation` no se distingue de una entrada. Se agrega `deltaReserved` y se renombra `delta` a `deltaOnHand`, actualizando `admin-mock.ts` en el mismo PR, como pide `BACKEND-REQUEST.md`.

## Código

- `packages/database/src/schema/store.ts`: las 7 tablas.
- Migraciones `0010_store_core` y `0011_store_append_order` (esta última agrega la columna `seq` que ordena de forma estable movimientos, eventos y notas): RLS, historiales sin edición ni borrado, restricciones (`on_hand ≥ reserved ≥ 0`, total del pedido, cantidad ≥ 1).
- `packages/database/src/store.ts`: productos (listar, buscar por slug o id, crear, editar); inventario (disponibilidad liberando antes lo vencido, ajustar, listar movimientos); pedidos (crear con apartado, idempotencia y folio; ligar sesión de Stripe; marcar pagado; liberar; buscar; eventos y notas).
- `pnpm store:seed`: crea UNO+UNO sin precio. Solo lo corre el usuario; nunca contra producción por iniciativa de Claude.
- `docs/store/BACKEND-PLAN.md`: los 9 subproyectos y los pendientes de negocio.

## Pruebas

Base en memoria (PGlite), como la preventa:
- apartar, vender y liberar, incluido el vencimiento;
- misma clave de idempotencia no duplica;
- webhook repetido;
- pago tras liberar, con y sin stock;
- límites del ajuste manual;
- la suma de movimientos coincide con las existencias;
- historiales sin edición ni borrado;
- RLS en las tablas nuevas (prueba existente).

**Límite de las pruebas:** la base en memoria atiende una conexión a la vez, así que no prueba el bloqueo real entre dos compras simultáneas. Se usa el mismo `FOR UPDATE` que la preventa, que ya funciona en producción; se prueba el resultado de forma secuencial.

## Fuera de alcance

Endpoints, panel y cambios a la preventa.

## Entrega

- Rama `feat/tienda-base-datos` desde `feat/panel-por-hacer`; PR aparte que se reajusta contra `main` cuando se mergee el #19.
- Al mergear a `main` corre la migración 0010 en producción: solo crea tablas vacías.
- Ejecución con subagentes y revisión por tarea.

## Pendientes de negocio (no inventar)

Precio de tienda de UNO+UNO, términos de la tienda, paquetes y precios para iglesias, proveedor de newsletter y de correos, fotos y textos oficiales, y si habrá cupones.
