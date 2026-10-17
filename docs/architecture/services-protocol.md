# Servicios dentro de Parla (super-app) — protocolo

Parla funciona como WeChat: además de chatear, el cliente usa **servicios de sistemas externos**
(tienda, delivery, pagos, salud…) sin salir de la app. Cada sistema externo tiene su propia API y
su propio formato; el **gateway (Go)** tiene un **traductor por sistema** que convierte ese formato en
los contratos limpios de `packages/types/src/contracts/services.types.ts`, y un **orquestador** que
arma el pedido completo.

```
navegador ─► gateway Go ─┬─ traductor mercaya ──► MercaYa  (tienda)      ┐
                         ├─ traductor rapidito  ──► Rapidito   (tarifa)      ├ simuladores: services/providers (4103)
                         ├─ traductor pagaya  ──► PagaYa   (QR tipo Yape)┘
                         └─ HTTP interno ──────► core NestJS (pedidos, negocio y repartidores) ─► Elixir ─► navegador (order:updated)
```

## Flujo de una compra

1. `GET /api/services` → catálogo de servicios (Mercado disponible; Salud «próximamente»).
2. `GET /api/services/mercado/products?q=azucar` → el gateway consulta MercaYa y devuelve `Product[]`.
3. `POST /api/services/mercado/quote` `{items, address}` → el gateway **vuelve a pedir los precios a
   la tienda** (nunca confía en el navegador), cotiza el delivery en Rapidito y **suma todo**:
   `OrderQuote {lines, subtotalCents, deliveryFeeCents, totalCents, etaMinutes}`.
4. `POST /api/services/mercado/orders` `{items, address}` → recotiza igual que el paso 3, reserva en
   MercaYa, crea el cobro en PagaYa (QR) y guarda el pedido en el core (`pending_payment`), con el id
   del cobro (`payment.chargeId`, para anularlo o devolverlo) y el tiempo estimado de Rapidito
   (`etaMinutes`).
   Responde `Order` con `payment.qrText` y `payment.payUrl`.
5. El cliente escanea el QR (en el simulador abre la página de PagaYa y pulsa «Pagar»).
   PagaYa avisa al gateway: `POST /hooks/pagaya` con firma HMAC-SHA256 en `x-pagaya-firma`.
6. El gateway marca el pedido `paid` en el core (solo si estaba `pending_payment`: idempotente). El
   core lo asigna al negocio del servicio y avisa al dueño (`business-order:updated` + push).
7. El dueño lo acepta en el core (`POST /api/business/orders/:id/accept` → `preparing`) o lo rechaza
   en el **gateway** (`POST /api/business/orders/:id/reject` → `rejected`, con devolución del pago; ver
   «Cancelar y devolver»). Solo el dueño, solo con el pedido `paid`; repetir la misma decisión no
   cambia nada.
8. Cuando está listo, el dueño llama `POST /api/business/orders/:id/ready` (core): → `searching_driver`.
   Desde ahí el **core reparte con los repartidores de Parla** (la flota de Rapidito, cuentas de Parla):
   un repartidor toma el pedido (`driver_assigned`), lo recoge en el negocio (`on_the_way`) y lo
   entrega (`delivered`). El gateway ya no despacha ni recibe avisos del delivery.
9. Rapidito solo da la **tarifa y el tiempo estimado** (cotización), que el gateway suma al total.
10. Cada cambio de estado lo publica el core por tiempo real: al cliente `order:updated` y, desde que
    se paga, al dueño `business-order:updated` (con el cliente).
11. `GET /api/orders` y `GET /api/orders/:id` (core) → historial «Mis pedidos»; `GET /api/business/orders`
    y `GET /api/business/orders/:id` → los pedidos del negocio.
12. Chat del pedido: `GET /api/orders/:id/contact` devuelve la otra parte (al cliente, el dueño; al
    dueño, el cliente) con su clave pública, y el navegador abre el chat cifrado directo de siempre.

Si el cobro vence sin pagarse, PagaYa avisa `EXPIRADO` → `payment_expired`.

## Cancelar y devolver (gateway)

Cancelar y rechazar mueven dinero en la billetera, así que los resuelve el gateway. Las tres rutas
exigen sesión, leen el pedido en el core (`InternalOrder` trae `userId` y `businessOwnerId`) y
responden 200 con el `Order` público. Si el pedido no es tuyo: 404 «Pedido no encontrado». Si está en
otro estado: 409 con el mensaje de cada caso. Si la billetera no responde: 502, y el pedido **no
cambia**, así que se puede reintentar. Primero se mueve el dinero (anular o devolver, ambos
idempotentes) y recién después se registra en el core con `expectStatus` y una nota para la línea de
tiempo. Repetir la misma acción devuelve el pedido sin tocar la billetera.

| Ruta | Quién | Desde | Qué hace |
| --- | --- | --- | --- |
| `POST /api/orders/:id/cancel` | cliente | `pending_payment`, `paid` | Sin pagar: **anula** el cobro → `cancelled` («Cancelado por el cliente»). Si justo se pagó (PagaYa responde `YA_PAGADO`), lo **devuelve**. Pagado: devuelve → `cancelled` («Cancelado por el cliente · pago devuelto»). Otro estado: 409 «La tienda ya aceptó tu pedido. Escríbele para cancelarlo.» |
| `POST /api/business/orders/:id/reject` | dueño | `paid` | Devuelve → `rejected` («Rechazado por la tienda · pago devuelto»). Otro estado: 409 «Este pedido ya no está esperando tu respuesta». |
| `POST /api/business/orders/:id/cancel` | dueño | `preparing`, `searching_driver`, `driver_assigned` | Devuelve → `cancelled` («Cancelado por la tienda · pago devuelto»). Otro estado: 409 «Ya no se puede cancelar: el pedido va en camino o terminó». |

Al devolver, el gateway manda `refundedAt` en `InternalUpdateOrder` y el core lo guarda en
`payment.refundedAt`.

**Pago que llega tarde**: si PagaYa avisa `PAGADO` para un pedido ya `cancelled` o `rejected` que no
tiene `payment.refundedAt` (pagó mientras se cancelaba), el gateway lo **devuelve** y lo registra sin
cambiar el estado (`expectStatus` y `status` iguales, con `paidAt`, `refundedAt` y la nota «Pago
recibido tras cancelar · devuelto»). Si la devolución falla, responde 503 para que PagaYa reintente el
aviso. Un aviso repetido no devuelve dos veces.

## Horario y catálogo de la tienda (gateway)

**Tienda abierta o cerrada.** Antes de cotizar (`POST /api/services/mercado/quote`) o de crear un
pedido, el gateway pregunta al core `GET /api/internal/businesses/by-service/mercado`. Si el negocio
está cerrado (`open: false`, por horario o porque la dueña la cerró) responde **409** con el
`closedMessage` del core (o «La tienda está cerrada ahora») y no reserva ni cobra nada. Si ningún
negocio atiende el servicio (404) se vende igual; si el core no responde, 502.

**Catálogo de la dueña.** Precios, ofertas y stock viven en MercaYa; la dueña los cambia desde Parla:

| Ruta (con sesión) | Qué hace |
| --- | --- |
| `GET /api/business/catalog` | Todo el catálogo de la tienda, también lo agotado, ordenado por categoría y nombre → `Product[]` |
| `PATCH /api/business/catalog/:sku` `{"priceCents"?, "listPriceCents"?: number\|null, "stock"?}` | Cambia precio, oferta o stock → el `Product` actualizado |

Solo la dueña: el gateway pregunta `GET /api/internal/businesses/by-owner/:userId`; si no es dueña de
un negocio del Mercado responde 404 «No tienes un negocio en Parla». En el `PATCH`, `listPriceCents`
**ausente** no toca la oferta, **null** la quita y un número pone una oferta (el precio normal tiene que
ser mayor que el de oferta). Validaciones (400): precio entre 10 y 1 000 000 céntimos, stock entre 0 y
100 000, y «No hay cambios» si el cuerpo viene vacío. Producto desconocido → 404; tienda caída → 502.

## Rutas internas del core (token entre servicios, nunca expuestas)

| Ruta | Para qué |
| --- | --- |
| `POST /api/internal/orders` `InternalCreateOrder` | Guarda el pedido nuevo → 201 `InternalOrder` |
| `GET /api/internal/orders/:id` | Lee el pedido (con `userId`, `deliveryQuoteId` y `businessOwnerId`) → `InternalOrder` |
| `GET /api/internal/businesses/by-service/:service` | El negocio que atiende un servicio → `{"id","name","service","ownerId","open","closedMessage"}`; 404 si ninguno |
| `GET /api/internal/businesses/by-owner/:userId` | El negocio de una persona, con la misma forma; 404 si no es dueña |
| `PATCH /api/internal/orders/:id` `InternalUpdateOrder` | Cambia estado/pago/delivery (`paidAt`, `refundedAt`, `note` para la línea de tiempo). Con `expectStatus`, si el estado actual no coincide responde **409** sin cambiar nada. Acepta el mismo estado (p. ej. la devolución de un pago tardío). Publica `order:updated` al dueño. |

## APIs externas (simuladas en `services/providers`, puerto 4103)

Formatos distintos a propósito: así es en la vida real y es lo que justifica los traductores.

**MercaYa** (tienda, español, precios en céntimos):
- `GET /mercaya/v1/catalogo?buscar=texto` → `{"resultados":[{"sku","nombre","presentacion","precio_centimos","stock","categoria","imagen"}]}`
- `POST /mercaya/v1/pedidos` `{"referencia","lineas":[{"sku","cantidad"}]}` → `{"numero_pedido","estado":"RESERVADO","total_centimos"}`; 409 `{"error":"SIN_STOCK","sku"}` si falta stock.
- Administración, con la clave en `x-mercaya-clave` (`MERCAYA_ADMIN_KEY`): `PATCH /mercaya/v1/productos/{sku}`
  `{"precio_centimos"?, "precio_antes_centimos"?: int|null, "stock"?}` → el `Producto` actualizado.
  `precio_antes_centimos: null` quita la oferta y si no viene no cambia. 400 `{"error":"DATOS_INVALIDOS"}`
  (precio ≤ 0, oferta que no es mayor que el precio, stock fuera de 0–100 000), 401 `{"error":"CLAVE_INVALIDA"}`, 404.

**Rapidito** (tarifa del delivery, inglés, montos en texto decimal):
- `POST /rapidito/api/quotes` `{"dropoff":{"address","notes"}}` → `{"quote_id","fee":{"amount":"6.50","currency":"PEN"},"eta_minutes","expires_at"}`

**PagaYa** (cobros con QR tipo Yape, montos en soles con decimales):
- `POST /pagaya/cobros` `{"monto":23.40,"moneda":"PEN","concepto","referencia","notificar_a"}` → `{"id_cobro","qr_texto","url_pago","expira_en"}`
- `GET /pagaya/pagar/{id}` → página para pagar (simula la app del banco); `POST` la confirma y avisa a `notificar_a`:
  `{"id_cobro","referencia","estado":"PAGADO"|"EXPIRADO","pagado_en"}`. Un cobro `ANULADO` o `DEVUELTO` no se puede pagar: 409 `{"error":"ANULADO"|"DEVUELTO"}` (la página dice «Este cobro fue anulado»).
- `POST /pagaya/cobros/{id}/anular` → `PENDIENTE` → `ANULADO`: 200 `{"id_cobro","estado":"ANULADO"}` (idempotente); 409 `{"error":"YA_PAGADO"}` si ya se pagó; 404 si no existe.
- `POST /pagaya/cobros/{id}/devolucion` → `PAGADO` → `DEVUELTO`: 200 `{"id_cobro","estado":"DEVUELTO","devuelto_en"}` (idempotente: repetirlo devuelve la misma fecha); 409 `{"error":"NO_PAGADO"}` si no se pagó.

La firma de los avisos de PagaYa es `hex(HMAC-SHA256(secreto, cuerpo))`. Secreto por variable de entorno
(`PAGAYA_WEBHOOK_SECRET`); en desarrollo hay un valor por defecto y en
producción el gateway no arranca sin secretos propios. Lo mismo con la clave de administración de
MercaYa (`MERCAYA_ADMIN_KEY`, 24+ caracteres en producción).
