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
