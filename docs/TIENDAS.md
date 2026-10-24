# Tiendas en Parla (marketplace)

Parla es un marketplace: en cada categoría (**Mercado, Tecnología, Ferretería, Salud**) puede haber **varias
tiendas**, y el cliente elige en cuál comprar. Una tienda **no se define en el `.env`**: la registra su dueño
desde la app y soporte la aprueba.

## El camino de una tienda

1. **Registro**: el dueño (cualquier persona con cuenta) toca **«Abrir mi tienda»** en el menú ☰ y llena nombre,
   categoría, dirección (con mapa) y horario. Queda **«En revisión»**: todavía no vende.
2. **Catálogo**: mientras espera arma su catálogo (ver abajo).
3. **Revisión**: en **Administración → Tiendas**, soporte la **aprueba** (o la rechaza con un motivo que el dueño
   ve; si corrige sus datos, vuelve a revisión). Soporte también puede **suspenderla** y **reactivarla**.
4. **Venta**: aprobada, aparece en la lista de su categoría. Los pedidos entran a **«Mi negocio»** del dueño, que
   los acepta, los deja listos y **Rapidito** (el delivery) los recoge.

Una cuenta tiene **una tienda**. El cliente compra de **una tienda por pedido** (si cambia de tienda, el carrito
empieza de nuevo).

## Dos formas de tener el catálogo

El dueño elige (y puede cambiar cuando quiera) en **Mi negocio → Catálogo**:

### A. Catálogo de Parla (para quien no tiene sistema)
Sube sus productos desde la app: **uno por uno** o **importando un archivo CSV** (Excel → «Guardar como CSV»).
La importación acepta separador `,` o `;`, cabeceras en español o inglés y muestra qué filas tienen errores antes de
guardar. Hay botón **«Descargar plantilla CSV»**.

Columnas: `sku` (código propio), `nombre`, `presentacion`, `precio` (en soles), `precio_antes` (si está en oferta),
`stock`, `categoria`, `imagen` (enlace `https://`), `activo`.

Parla controla el stock: al hacer un pedido **aparta** las unidades (todo o nada, sin dejar stock negativo aunque
compren dos personas a la vez) y si el pedido se cancela o no se paga, **las devuelve**.

### B. Mi propio sistema (para quien ya tiene tienda en línea)
El dueño entra a **Mi negocio → Conectar mi sistema**, escribe la URL de su API y la llave, y toca **«Probar
conexión»**. Parla **no copia su catálogo**: lo consulta en vivo, así que precio y stock son siempre los de la tienda.
Para volver al catálogo de Parla basta con desconectar la API.

La API de la tienda debe ofrecer estos endpoints (JSON, precios en **céntimos**, por defecto bajo `/mercaya/v1`;
la ruta es configurable) y recibir la llave en la cabecera `x-api-key`:

| Método y ruta | Para qué |
| --- | --- |
| `GET /catalogo?buscar=texto` | Buscar productos |
| `GET /productos/{sku}` | Precio y stock vigentes de un producto |
| `POST /pedidos` | **Reservar** el stock de un pedido (idempotente por `referencia`) |
| `DELETE /pedidos/{referencia}` | Anular la reserva (pedido cancelado, rechazado o sin pago) |
| `PATCH /productos/{sku}` *(opcional)* | El dueño cambia precio, oferta o stock desde Parla (cabecera `x-mercaya-clave`) |

**Producto:**

```json
{
  "sku": "ARR-EXT-5K",
  "nombre": "Arroz extra",
  "presentacion": "5 kg",
  "precio_centimos": 2290,
  "stock": 40,
  "categoria": "abarrotes",
  "imagen": "https://tienda.pe/img/arroz.jpg",
  "precio_antes_centimos": 2590
}
```

- `GET /catalogo` responde `{ "resultados": [ producto, … ] }`.
- `imagen` solo se acepta con `https://`. `precio_antes_centimos` solo cuenta como oferta si es **mayor** que el precio.
- **Reservar** — `POST /pedidos` con `{ "referencia": "ord_123", "lineas": [ { "sku": "ARR-EXT-5K", "cantidad": 2 } ] }`:
  - `201` `{ "estado": "RESERVADO" }` → listo
  - `409` `{ "error": "SIN_STOCK", "sku": "…" }` → no alcanza
  - `422` → producto desconocido
- **Anular** — `DELETE /pedidos/{referencia}` → `200` (o `404` si no existía; Parla lo toma como éxito).
- Un `5xx` o una respuesta rota se trata como «tienda no disponible» y Parla reintenta una vez.

Si la tienda usa **RED WIIIL**, Parla ya entiende su API v1: se elige ese formato al conectarla.

## Pasar una tienda ya armada a Parla

- **Tiene sistema o tienda en línea con API** → camino **B** (puede quedarse con su sistema y su inventario).
- **Tiene su catálogo en Excel o en otra plataforma** → camino **A** con importación CSV.
- **Vende solo por redes** → camino **A** y empieza con unos pocos productos.

## Cómo funciona por dentro (para quien desarrolla)

Una tienda con catálogo de Parla se conecta **como si fuera una tienda con API**, pero apuntando al propio core
(`/api/internal/store-api/{tiendaId}/…`, el mismo contrato de la tabla de arriba). Así el gateway usa **un solo flujo**
de cotización, reserva de stock, cobro y entrega para todas las tiendas. La «clave de tienda» en las rutas
`/api/services/{tiendaId}/products|quote|orders` es el **id de la tienda**.

Código: `apps/api/src/modules/platform/stores` (casos de uso, catálogo, API de tienda), `apps/web/src/modules/business`
(pantallas del dueño), `apps/web/src/modules/admin/components/AdminStores.tsx` (revisión de soporte).

## Ferreterías con FerroHub

Una ferretería que usa **FerroHub (RED WIIIL)** se conecta en menos de un minuto y vende en Parla con su inventario
y su stock **reales** (Parla consulta su API en vivo, no copia el catálogo).

### Crear tienda → Ferretería

En el menú ☰ → **«Crear tienda»** → se elige la categoría (Ferretería, Mercado, Salud, Tecnología). Las demás categorías siguen
su flujo de siempre; **Ferretería** ofrece tres caminos (`/app/negocio/nueva/ferreteria`):

1. **«Ya uso FerroHub → Conectar mi tienda»** — se escribe el **código de enlace** `FH-XXXX-XXXX` que el dueño genera en FerroHub
   (Configuración → Pedidos en línea). Un solo uso, vence en 10 minutos, sin 0/O/1/I. Parla lo canjea
   (`POST {FERROHUB_API_URL}/v1/connect/redeem`), comprueba que puede leer los productos, **precarga** nombre, dirección,
   ubicación y horario desde `GET /api/v1/store-info`, y deja al dueño en «Datos de mi tienda» para revisar y confirmar.
   - FerroHub con estado **«activa»** → la tienda queda **aprobada y «Ferretería verificada»** sin esperar a soporte. Las demás
     (prueba, suspendida) pasan a revisión; soporte siempre puede suspenderla.
   - Tras 5 intentos fallidos en un minuto se pide esperar 1 minuto. Errores: código inválido (404), usado o vencido (410).
2. **«Crear mi ferretería»** — con su cuenta de Parla (sin segunda cuenta ni clave) Parla llama a
   `POST {FERROHUB_API_URL}/v1/provision`; FerroHub crea la ferretería (plan Semilla, en prueba) y devuelve la llave y un enlace
   de **un solo uso (60 s)** que abre su panel de dueño. La tienda queda conectada y **se publica sola con el primer producto**
   (aviso `producto.actualizado`). Si algo falla después de crearla, se deshace en FerroHub (`DELETE /v1/provision/{tenantId}`).
3. **«Solo un catálogo simple en Parla»** — el catálogo de Parla de siempre (sin FerroHub).

En **Mi negocio** la tienda conectada muestra «Conectado a FerroHub» (y «Verificada»), **«Abrir mi panel FerroHub»**
(`POST {FERROHUB_API_URL}/v1/sso`, enlace nuevo de un solo uso) y **«Desvincular»** (borra la llave y avisa con
`DELETE …/v1/connect/{parlaStoreId}`). Una ferretería ya registrada sin conexión ve «Conectar con FerroHub».

### Avisos de FerroHub hacia Parla (webhook)

`POST /api/stores/{id}/ferrohub-events`, sin sesión: se autentica con `x-ferrohub-signature` = HMAC-SHA256(secreto de esa tienda,
cuerpo) y `x-ferrohub-timestamp` (se rechaza si pasan más de 5 minutos). Cada `eventId` cuenta una vez. Eventos:
`tienda.cerrada` / `tienda.abierta` (pausa o reanuda pedidos), `desvinculada` (corta la conexión y borra la llave),
`producto.actualizado` / `producto.agotado` (publican solas las ferreterías creadas desde Parla).

### Seguridad

- La llave `wiiil_…` y el secreto de los avisos se guardan **cifrados** (AES-256-GCM; clave `SECRETS_KEY`, o derivada de
  `JWT_SECRET`) y solo se usan en el servidor. Los valores guardados antes de este cambio se leen igual y se cifran al reescribirse.
- Las cuentas de soporte no abren tiendas ni se registran como repartidores.

### Probarlo sin el FerroHub real

`npm run ferrohub:sim` levanta un FerroHub de mentira en `http://localhost:4300` (la portada genera un código de enlace) y se usa
con `FERROHUB_API_URL=http://localhost:4300` en el `.env`. `POST /sim/event` dispara avisos firmados hacia Parla.

## Pedidos grandes

Un pedido de obra o de mucha cantidad no sigue el flujo automático: la tienda lo **confirma con el cliente** (stock físico,
tiempo, si hace falta camioneta) antes de prepararlo. Es **grande** si el total llega al umbral de la tienda **o** lleva
tantas unidades como su umbral de unidades. Una ferretería de FerroHub trae los suyos (`umbralPedidoGrande`,
`umbralUnidades`, `whatsappAdmin` de su ficha); si no, valen S/ 600 y 25 unidades (`BIG_ORDER_TOTAL_CENTS`, `BIG_ORDER_UNITS`).

- **Cliente, al cotizar:** un aviso «Es un pedido grande…» con el botón **«Escribir a la tienda por WhatsApp»** (enlace `wa.me`
  con el resumen ya escrito). Con el pedido hecho, el mismo aviso aparece en su detalle y sigue el chat del pedido de siempre.
- **No se despacha solo:** ya requería que la tienda lo aceptara; no llega a los repartidores hasta que lo deja listo.
- **Tienda:** aviso push **«Pedido GRANDE»**, etiqueta roja **GRANDE** arriba de «Nuevos», alerta en el detalle y, solo en los
  grandes, el **teléfono del cliente** (botón WhatsApp) para confirmarlo al instante.
- **Escalamiento** (vigilancia cada 60 s): a los **10 min** sin aceptar, segundo aviso a la tienda; a los **20 min**, aviso a
  soporte (cuentas de administración). Se configura con `BIG_ORDER_REMIND_MINUTES`, `BIG_ORDER_SUPPORT_MINUTES` y
  `BIG_ORDER_WATCH_INTERVAL_MS` (0 la apaga).
- **Pago:** se cobra completo al pedir (sin «reserva con adelanto»: es lo más simple).
- El pedido grande **se calcula al vuelo** con el total y las unidades (no se guarda una marca en el pedido).

### Lo que la ferretería recibe de cada pedido

- **Al reservar la venta** (`POST /api/v1/sales`, antes de cobrar) el gateway agrega, además de los productos, datos opcionales que una
  ferretería que no los conoce ignora: `canal: "parla"`, `grande` (true si el pedido llega a sus umbrales) y
  `entrega { direccion, costo, propina }` (en soles). No manda teléfono del cliente: el gateway no lo tiene.
- **En cada cambio de estado** (`PATCH /api/v1/orders/{pedido}` con `{ "estado": … }`): `nuevo` (pagado), `preparando`, `listo`
  (buscando o con repartidor), `en_camino`, `entregado` y `cancelado` (rechazado, cancelado o cobro vencido). Si la ferretería
  responde 404 (no tiene la ruta) o no responde, se ignora sin afectar el pedido.

## Ventas y depósitos de la tienda

La tienda cobra por PagaYa **a través de Parla**, que se lo deposita. Cada pedido **entregado** suma a su billetera los **productos**
(el delivery y la propina son del repartidor) y resta la **comisión de Parla**: 5 % por defecto, o `STORE_COMMISSION_<CATEGORÍA>`
(p. ej. `STORE_COMMISSION_FERRETERIA=4`), o `STORE_COMMISSION_PERCENT` para todas. Un cupón lo absorbe Parla, no la tienda.

En **Mi negocio → «Mis ventas y depósitos»** la dueña ve su saldo, el porcentaje de comisión, cada movimiento (venta, comisión, depósito)
y su **número de PagaYa**. Cobra de dos maneras, por el mismo recorrido que los repartidores (apartar el saldo → transferir → cerrar →
conciliar, idempotente por referencia `sp_…`, así nunca se paga dos veces):

- **Automático** todos los días a las 23:00 (hora de Lima) si tiene S/ 5 o más (`RAPIDITO_PAYOUT_AT`, mismos mínimos que los repartidores).
- **«Retirar ahora»** (desde S/ 1). Un depósito fallido devuelve el dinero al saldo; uno pendiente se concilia cada hora.

### Todavía no incluido

Sondeo de respaldo cada 60 s y sincronización completa de catálogo cada 12 h (Parla consulta el catálogo en vivo, así que no copia
productos), mensaje automático dentro del chat cifrado, botones de respuesta rápida y circuito abierto tras 5 fallos seguidos.
