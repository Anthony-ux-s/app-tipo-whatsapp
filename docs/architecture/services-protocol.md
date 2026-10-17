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
   MercaYa, crea el cobro en PagaYa (QR) y guarda el pedido en el core (`pending_payment`).
   Responde `Order` con `payment.qrText` y `payment.payUrl`.
5. El cliente escanea el QR (en el simulador abre la página de PagaYa y pulsa «Pagar»).
   PagaYa avisa al gateway: `POST /hooks/pagaya` con firma HMAC-SHA256 en `x-pagaya-firma`.
6. El gateway marca el pedido `paid` en el core (solo si estaba `pending_payment`: idempotente). El
   core lo asigna al negocio del servicio y avisa al dueño (`business-order:updated` + push).
7. El dueño lo acepta o lo rechaza en el core: `POST /api/business/orders/:id/accept` → `preparing`,
   `.../reject` → `rejected`. Solo el dueño, solo con el pedido `paid`; repetir la misma decisión no
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

**Rapidito** (tarifa del delivery, inglés, montos en texto decimal):
- `POST /rapidito/api/quotes` `{"dropoff":{"address","notes"}}` → `{"quote_id","fee":{"amount":"6.50","currency":"PEN"},"eta_minutes","expires_at"}`

**PagaYa** (cobros con QR tipo Yape, montos en soles con decimales):
- `POST /pagaya/cobros` `{"monto":23.40,"moneda":"PEN","concepto","referencia","notificar_a"}` → `{"id_cobro","qr_texto","url_pago","expira_en"}`
- `GET /pagaya/pagar/{id}` → página para pagar (simula la app del banco); `POST` la confirma y avisa a `notificar_a`:
  `{"id_cobro","referencia","estado":"PAGADO"|"EXPIRADO","pagado_en"}`

La firma de los avisos de PagaYa es `hex(HMAC-SHA256(secreto, cuerpo))`. Secreto por variable de entorno
(`PAGAYA_WEBHOOK_SECRET`); en desarrollo hay un valor por defecto y en
producción el gateway no arranca sin secretos propios.
