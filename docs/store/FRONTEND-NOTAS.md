# Notas para el frontend de la tienda (antes de abrirla al público)

Para Alan. El backend de PR A "Vender" ya responde con el contrato de `apps/inttimo/src/lib/store/contract.ts`. Al probar la tienda en modo `http` (`NEXT_PUBLIC_STORE_API=http`) contra el backend real salieron estos puntos del lado del frontend. Ninguno se corrigió desde backend: son archivos tuyos. Cada punto dice el archivo y lo que hace el servidor.

## Checkout

1. **Mandar las líneas cotizadas, no las del carrito.** `src/components/store/checkout/CheckoutView.tsx` (`onSubmit`) envía `lines` tal como están en el carrito. `POST /api/tienda/carrito/cotizar` puede quitar o recortar líneas (producto desconocido, sin precio, agotado o por encima del máximo por pedido). Si el checkout recibe esas líneas, responde `409 out_of_stock` (producto no disponible o sin stock) o `400 validation_error` (más del máximo por pedido), con `fieldErrors.lines`. Mandar `quote.lines` (solo las `available`, con su cantidad) o bloquear el botón mientras haya líneas no disponibles.

2. **Después de un `409 quote_expired` no se puede volver a cotizar.** En `CheckoutView.tsx`, `shippingQuote` sigue guardada tras el error. El efecto de cotización automática no corre si ya hay `shippingQuote` o si `errors.shipping` tiene mensajes, así que la persona se queda atorada hasta que cambia la dirección. El servidor responde `quote_expired` cuando la cotización venció (2 horas), cambió el código postal (`fieldErrors["address.postalCode"]`) o cambió el carrito (`fieldErrors.shipping`). Con `quote_expired`: limpiar `shippingQuote` y `rateId` y volver a cotizar, o mostrar un botón "Volver a calcular".

3. **Cambiar la `Idempotency-Key` después de cualquier respuesta que no sea OK.** `CheckoutView.tsx` crea una sola clave por montaje (`useState(() => crypto.randomUUID())`). El servidor, con la misma clave:
   - devuelve la misma sesión de Stripe si el pedido sigue pendiente, la sesión sigue vigente y **los datos son los mismos**;
   - responde **`409 validation_error` "Los datos de esta compra cambiaron. Recarga la página para iniciar una nueva."** si cambió el correo, el método de entrega, el punto de recolección, la dirección, la tarifa o cotización de envío, o los productos y cantidades;
   - responde 409 si ese intento ya falló, venció o ya se pagó.

   Después de un 4xx o 5xx la persona corrige el formulario y vuelve a enviar. Con la misma clave se encuentra con ese 409. Hay que generar una clave nueva tras cada respuesta no OK, y conservarla solo para reintentos idénticos (doble clic o red caída sin respuesta).

4. **Nuevo mensaje 429.** Además de "Demasiados intentos…" (ahora 5 intentos cada 10 minutos por IP y 5 por correo), el checkout responde `429 rate_limited` con **"Ya tienes piezas apartadas en otra compra. Termina ese pago o espera unos minutos."** cuando el mismo correo o la misma IP ya tiene piezas apartadas en compras sin pagar y con esta pasaría de 20. Mostrar `error.message` tal cual. No lleva `fieldErrors`.

## Confirmación del pedido

5. **"Tu pedido está confirmado" también sale para pedidos con incidencia.** `src/components/store/order/ConfirmationClient.tsx` usa `paid = order.paymentStatus === "paid"` y muestra el título de confirmado aunque `fulfillmentStatus` sea `"exception"`. Ese caso es un pago que llegó cuando ya no había stock: el pedido no se va a surtir y el equipo lo va a reembolsar, y al cliente **no** se le manda correo de confirmación. Con `fulfillmentStatus: "exception"` mostrar otro mensaje, por ejemplo "Recibimos tu pago, pero hubo un problema con tu pedido. Te contactaremos." Ese texto lo aprueba Karina.

6. **`OrderSteps` convierte la incidencia en "Pedido confirmado".** En `src/components/store/order/OrderParts.tsx`, `rank()` devuelve 0 para cualquier estado que no esté en el flujo, así que `exception` marca como hecho el paso "Pedido confirmado". Con `exception` hay que mostrar el estado de incidencia (`FULFILLMENT_TEXT.exception`) en lugar de los pasos.

7. **El texto "Te enviamos un correo…" no siempre es cierto.** `ConfirmationClient.tsx` lo muestra en todos los casos. El correo solo se manda cuando el pedido está `paid` y no está en `exception`, y puede tardar unos segundos. Mostrarlo solo en ese caso.

8. **Un pedido pendiente muestra el paso "Pedido confirmado" como hecho.** Con `paymentStatus: "pending"` (pago en proceso, p. ej. métodos asíncronos), `fulfillmentStatus` ya vale `"confirmed"`, así que `OrderSteps` lo marca como hecho. Mientras el pago no sea `paid` no debería marcarse ningún paso.

9. **Vaciar el carrito después de un pago confirmado en modo `http`.** `CheckoutView.tsx` solo llama `clear()` en modo `mock`. En `http`, el carrito sigue lleno al volver de Stripe. Vaciarlo en `ConfirmationClient.tsx` cuando la confirmación llega con `paymentStatus: "paid"`. Antes no, porque si el pago no se completa la persona debe poder reintentar con el mismo carrito.

## Carrito

10. **"Agotado" en productos "Próximamente".** `src/components/store/cart/CartLineItem.tsx` muestra "Agotado: quítalo para continuar." para cualquier línea con `available: false`. Una línea de un producto `coming_soon` (o sin precio) también llega con `available: false`, y su `notice` dice por qué. Usar `line.notice` o distinguir el estado en lugar de decir siempre "Agotado".

## Otros

- `src/lib/store/flags.ts` dice que la tienda "se ve en previews", pero no es así. Los previews de Vercel se construyen con `NODE_ENV=production`, así que la tienda solo se ve con `NEXT_PUBLIC_STORE_ENABLED=1`. No activar esa variable en un Preview que use llaves live de Stripe.
