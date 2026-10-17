# Servicios dentro de Parla (super-app) — protocolo

Parla funciona como WeChat: además de chatear, el cliente usa **servicios de sistemas externos**
(tienda, delivery, pagos, salud…) sin salir de la app. Cada sistema externo tiene su propia API y
su propio formato; el **gateway (Go)** tiene un **traductor por sistema** que convierte ese formato en
los contratos limpios de `packages/types/src/contracts/services.types.ts`, y un **orquestador** que
arma el pedido completo.

```
navegador ─► gateway Go ─┬─ traductor mercaya ──► MercaYa  (tienda)      ┐
                         ├─ traductor rapidito  ──► Rapidito   (delivery)    ├ simuladores: services/providers (4103)
                         ├─ traductor pagaya  ──► PagaYa   (QR tipo Yape)┘
                         └─ HTTP interno ──────► core NestJS (guarda pedidos) ─► Elixir ─► navegador (order:updated)
```

## Flujo de una compra

1. `GET /api/services` → catálogo de servicios (Mercado disponible; Salud «próximamente»).
2. `GET /api/services/mercado/products?q=azucar` → el gateway consulta MercaYa y devuelve `Product[]`.
3. `POST /api/services/mercado/quote` `{items, address}` → el gateway **vuelve a pedir los precios a
   la tienda** (nunca confía en el navegador), cotiza el delivery en Rapidito y **suma todo**:
   `OrderQuote {lines, subtotalCents, deliveryFeeCents, totalCents, etaMinutes}`.
4. `POST /api/services/mercado/orders` `{items, address}` → recotiza igual que el paso 3, reserva en
   MercaYa, crea el cobro en PagaYa (QR) y guarda el pedido en el core (`pending_payment`).
   Responde `Order` con `payment.qrText` y `payment.payUrl`.
5. El cliente escanea el QR (en el simulador abre la página de PagaYa y pulsa «Pagar»).
   PagaYa avisa al gateway: `POST /hooks/pagaya` con firma HMAC-SHA256 en `x-pagaya-firma`.
6. El gateway marca el pedido `paid` en el core (solo si estaba `pending_payment`: idempotente). El
   core lo asigna al negocio del servicio y avisa al dueño (`business-order:updated` + push).
7. El dueño lo acepta o lo rechaza en el core: `POST /api/business/orders/:id/accept` → `preparing`,
   `.../reject` → `rejected`. Solo el dueño, solo con el pedido `paid`; repetir la misma decisión no
   cambia nada.
8. Cuando está listo, el dueño llama `POST /api/business/orders/:id/ready` (**gateway**): comprueba que
   es el dueño y que está `preparing`, **despacha el delivery** en Rapidito con la cotización guardada
   → `searching_driver`. Si Rapidito falla, el pedido sigue en `preparing` y se puede reintentar.
9. Rapidito avisa cada cambio: `POST /hooks/rapidito` con firma en `x-rapidito-signature`
   (`DRIVER_ASSIGNED` → `on_the_way` con nombre del motorizado; `DELIVERED` → `delivered`).
10. Cada cambio de estado lo publica el core por tiempo real: al cliente `order:updated` y, desde que
    se paga, al dueño `business-order:updated` (con el cliente).
11. `GET /api/orders` y `GET /api/orders/:id` (core) → historial «Mis pedidos»; `GET /api/business/orders`
    y `GET /api/business/orders/:id` → los pedidos del negocio.
12. Chat del pedido: `GET /api/orders/:id/contact` devuelve la otra parte (al cliente, el dueño; al
    dueño, el cliente) con su clave pública, y el navegador abre el chat cifrado directo de siempre.

Si el cobro vence sin pagarse, PagaYa avisa `EXPIRADO` → `payment_expired`.

## Rutas internas del core (token entre servicios, nunca expuestas)

| Ruta | Para qué |
| --- | --- |
| `POST /api/internal/orders` `InternalCreateOrder` | Guarda el pedido nuevo → 201 `InternalOrder` |
| `GET /api/internal/orders/:id` | Lee el pedido (con `userId`, `deliveryQuoteId` y `businessOwnerId`) → `InternalOrder` |
| `PATCH /api/internal/orders/:id` `InternalUpdateOrder` | Cambia estado/pago/delivery. Con `expectStatus`, si el estado actual no coincide responde **409** sin cambiar nada. Publica `order:updated` al dueño. |

## APIs externas (simuladas en `services/providers`, puerto 4103)

Formatos distintos a propósito: así es en la vida real y es lo que justifica los traductores.

**MercaYa** (tienda, español, precios en céntimos):
- `GET /mercaya/v1/catalogo?buscar=texto` → `{"resultados":[{"sku","nombre","presentacion","precio_centimos","stock","categoria","imagen"}]}`
- `POST /mercaya/v1/pedidos` `{"referencia","lineas":[{"sku","cantidad"}]}` → `{"numero_pedido","estado":"RESERVADO","total_centimos"}`; 409 `{"error":"SIN_STOCK","sku"}` si falta stock.

**Rapidito** (delivery, inglés, montos en texto decimal):
- `POST /rapidito/api/quotes` `{"dropoff":{"address","notes"}}` → `{"quote_id","fee":{"amount":"6.50","currency":"PEN"},"eta_minutes"}`
- `POST /rapidito/api/deliveries` `{"quote_id","reference","callback_url"}` → `{"delivery_id","status":"SEARCHING_DRIVER"}`; luego avisa a `callback_url`:
  `{"delivery_id","reference","status":"DRIVER_ASSIGNED"|"DELIVERED","driver":{"name","vehicle"},"eta_minutes"}`

**PagaYa** (cobros con QR tipo Yape, montos en soles con decimales):
- `POST /pagaya/cobros` `{"monto":23.40,"moneda":"PEN","concepto","referencia","notificar_a"}` → `{"id_cobro","qr_texto","url_pago","expira_en"}`
- `GET /pagaya/pagar/{id}` → página para pagar (simula la app del banco); `POST` la confirma y avisa a `notificar_a`:
  `{"id_cobro","referencia","estado":"PAGADO"|"EXPIRADO","pagado_en"}`

Las firmas de los avisos son `hex(HMAC-SHA256(secreto, cuerpo))`. Secretos por variable de entorno
(`PAGAYA_WEBHOOK_SECRET`, `RAPIDITO_WEBHOOK_SECRET`); en desarrollo hay valores por defecto y en
producción el gateway no arranca sin secretos propios.
