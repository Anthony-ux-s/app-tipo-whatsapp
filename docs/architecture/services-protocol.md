# Servicios dentro de Parla (super-app) — protocolo

Parla funciona como WeChat: además de chatear, el cliente usa **servicios de sistemas externos**
(tienda, delivery, pagos, salud…) sin salir de la app. Cada sistema externo tiene su propia API y
su propio formato; el **gateway (Go)** tiene un **traductor por sistema** que convierte ese formato en
los contratos limpios de `packages/types/src/contracts/services.types.ts`, y un **orquestador** que
arma el pedido completo.

```
navegador ─► gateway Go ─┬─ traductor mercaya ──► MercaYa  (tienda)      ┐
                         ├─ traductor motoya  ──► MotoYa   (delivery)    ├ simuladores: services/providers (4103)
                         ├─ traductor pagaya  ──► PagaYa   (QR tipo Yape)┘
                         └─ HTTP interno ──────► core NestJS (guarda pedidos) ─► Elixir ─► navegador (order:updated)
```

## Flujo de una compra

1. `GET /api/services` → catálogo de servicios (Mercado disponible; Salud «próximamente»).
2. `GET /api/services/mercado/products?q=azucar` → el gateway consulta MercaYa y devuelve `Product[]`.
3. `POST /api/services/mercado/quote` `{items, address}` → el gateway **vuelve a pedir los precios a
   la tienda** (nunca confía en el navegador), cotiza el delivery en MotoYa y **suma todo**:
   `OrderQuote {lines, subtotalCents, deliveryFeeCents, totalCents, etaMinutes}`.
4. `POST /api/services/mercado/orders` `{items, address}` → recotiza igual que el paso 3, reserva en
   MercaYa, crea el cobro en PagaYa (QR) y guarda el pedido en el core (`pending_payment`).
   Responde `Order` con `payment.qrText` y `payment.payUrl`.
5. El cliente escanea el QR (en el simulador abre la página de PagaYa y pulsa «Pagar»).
   PagaYa avisa al gateway: `POST /hooks/pagaya` con firma HMAC-SHA256 en `x-pagaya-firma`.
6. El gateway marca el pedido `paid` en el core (solo si estaba `pending_payment`: idempotente) y
   **despacha el delivery** en MotoYa con la cotización guardada → `searching_driver`.
7. MotoYa avisa cada cambio: `POST /hooks/motoya` con firma en `x-motoya-signature`
   (`DRIVER_ASSIGNED` → `on_the_way` con nombre del motorizado; `DELIVERED` → `delivered`).
8. Cada cambio de estado lo publica el core al cliente por tiempo real: evento `order:updated`.
9. `GET /api/orders` y `GET /api/orders/:id` (core) → historial «Mis pedidos».

Si el cobro vence sin pagarse, PagaYa avisa `EXPIRADO` → `payment_expired`.

## Rutas internas del core (token entre servicios, nunca expuestas)

| Ruta | Para qué |
| --- | --- |
| `POST /api/internal/orders` `InternalCreateOrder` | Guarda el pedido nuevo → 201 `InternalOrder` |
| `GET /api/internal/orders/:id` | Lee el pedido (con `userId` y `deliveryQuoteId`) → `InternalOrder` |
| `PATCH /api/internal/orders/:id` `InternalUpdateOrder` | Cambia estado/pago/delivery. Con `expectStatus`, si el estado actual no coincide responde **409** sin cambiar nada. Publica `order:updated` al dueño. |

## APIs externas (simuladas en `services/providers`, puerto 4103)

Formatos distintos a propósito: así es en la vida real y es lo que justifica los traductores.

**MercaYa** (tienda, español, precios en céntimos):
- `GET /mercaya/v1/catalogo?buscar=texto` → `{"resultados":[{"sku","nombre","presentacion","precio_centimos","stock","categoria","imagen"}]}`
- `POST /mercaya/v1/pedidos` `{"referencia","lineas":[{"sku","cantidad"}]}` → `{"numero_pedido","estado":"RESERVADO","total_centimos"}`; 409 `{"error":"SIN_STOCK","sku"}` si falta stock.

**MotoYa** (delivery, inglés, montos en texto decimal):
- `POST /motoya/api/quotes` `{"dropoff":{"address","notes"}}` → `{"quote_id","fee":{"amount":"6.50","currency":"PEN"},"eta_minutes"}`
- `POST /motoya/api/deliveries` `{"quote_id","reference","callback_url"}` → `{"delivery_id","status":"SEARCHING_DRIVER"}`; luego avisa a `callback_url`:
  `{"delivery_id","reference","status":"DRIVER_ASSIGNED"|"DELIVERED","driver":{"name","vehicle"},"eta_minutes"}`

**PagaYa** (cobros con QR tipo Yape, montos en soles con decimales):
- `POST /pagaya/cobros` `{"monto":23.40,"moneda":"PEN","concepto","referencia","notificar_a"}` → `{"id_cobro","qr_texto","url_pago","expira_en"}`
- `GET /pagaya/pagar/{id}` → página para pagar (simula la app del banco); `POST` la confirma y avisa a `notificar_a`:
  `{"id_cobro","referencia","estado":"PAGADO"|"EXPIRADO","pagado_en"}`

Las firmas de los avisos son `hex(HMAC-SHA256(secreto, cuerpo))`. Secretos por variable de entorno
(`PAGAYA_WEBHOOK_SECRET`, `MOTOYA_WEBHOOK_SECRET`); en desarrollo hay valores por defecto y en
producción el gateway no arranca sin secretos propios.
