# Parla — chats y servicios

App tipo WhatsApp con servicios dentro, al estilo de WeChat. Puedes chatear con cualquier persona
registrada, en chats individuales y grupales en tiempo real, con fotos, videos, notas de voz y
**llamadas de voz y video**, todo **cifrado de extremo a extremo**. Desde **Servicios** haces el
mercado: buscas «un kilo de azúcar, arroz», pagas con un **QR tipo Yape** y un **delivery** te lo
lleva. Parla suma los productos y el delivery y te muestra el pedido en vivo hasta que llega. Se
instala en el celular como PWA.

![Logo](apps/web/public/icons/icon-192.png)

## Arrancar

Requisitos: **Node.js 20.19+**, **Go 1.23+** y **Elixir 1.17+ con Erlang/OTP 27+** (probado con Node 24,
Go 1.27 y Elixir 1.20 / OTP 29). En Windows: `winget install GoLang.Go Erlang.ErlangOTP Elixir.Elixir`.
Si Go o Elixir no quedaron en el PATH de la terminal, el script los busca en su carpeta de instalación.
No hace falta instalar ninguna base de datos ni contratar ningún servicio: la tienda, el delivery y la
billetera son simuladores locales.

```bash
npm start
```

Ese único comando instala las dependencias (la primera vez), crea `apps/api/.env`, prepara la
base de datos SQLite embebida, carga los datos de ejemplo, compila el gateway y los simuladores (Go) y
el tiempo real (Elixir), y levanta cinco procesos:

| Servicio | URL | Quién lo ve |
| --- | --- | --- |
| Web (PWA) | http://localhost:3100 | el navegador |
| **Gateway** (Go) | http://localhost:4100 — `/api`, `/ws`, `/hooks/pagaya`, salud en `/gateway/health` | la única puerta del backend |
| Core (NestJS) | http://localhost:4101/api | solo el gateway y el tiempo real |
| Tiempo real (Elixir) | http://localhost:4102 | solo el gateway y el core |
| APIs externas simuladas | http://localhost:4103 — MercaYa (tienda), Rapidito (delivery), PagaYa (billetera) | el gateway, y la página de pago que abre el QR |

Los puertos se pueden cambiar con `PARLA_WEB_PORT`, `PARLA_GATEWAY_PORT`, `PARLA_CORE_PORT`,
`PARLA_REALTIME_PORT` y `PARLA_PROVIDERS_PORT`.

Para instalarla en el celular, abre la web desde el navegador del teléfono y elige «Agregar a la
pantalla de inicio». La cámara, el micrófono y las notificaciones push exigen HTTPS fuera de
`localhost` (ver [Despliegue](#despliegue-a-producción)).

Otros comandos:

| Comando | Para qué |
| --- | --- |
| — | Sin `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY` los códigos salen en pantalla (solo en desarrollo; en producción el core no arranca sin OneSignal). |
| `npm run dev` | Igual que `start` pero con el core en modo *watch* (sin recargar datos). |
| `npm run start:prod` | **Producción**: compila todo y el gateway sirve web, API, tiempo real y avisos en http://localhost:4100. |
| `npm test` | Pruebas unitarias: cifrado, casos de uso del core y utilidades de la web. |
| `go test ./...` en `services/gateway` y `services/providers` · `mix test` en `services/realtime` | Pruebas del gateway, los simuladores y el tiempo real. |
| `npm run test:e2e` | Recorrido de punta a punta con Playwright. La primera vez: `npx playwright install chromium`. |
| `npm run db:reset` | Borra la base de desarrollo y los archivos, y vuelve a cargar los datos de ejemplo. |
| `npm run typecheck` / `npm run build` | Verificación de tipos y compilación de producción. |

## Usuarios de prueba

Contraseña para todos: **`Parla2026!`**

| Entrar con | Persona | Qué tiene |
| --- | --- | --- |
| `laura` | Laura Méndez | La más activa: grupos, chats y pedidos |
| `andres` | Andrés Rojas | Para chatear o llamar a Laura |
| `camila` | Camila Torres | Creó (y administra) el grupo «Diseño tienda en línea» |
| `tienda` | Elena Condori | **Dueña de Bodega MercaYa**: recibe los pedidos del Mercado, los acepta, los alista y se los entrega al repartidor |
| `repartidor` | Carlos Huamán | **Repartidor de Rapidito** (moto B7K-482): toma pedidos listos, los recoge y los entrega con el código del cliente |
| `repartidora` | Lucía Ramos | **Repartidora de Rapidito** (moto D5T-663): para ver que el primero que toma un pedido se lo queda |
| `soporte` | Soporte Parla | **Soporte**: en *Ajustes → Soporte Parla* aprueba o rechaza repartidores nuevos y resuelve reclamos con devolución |
| `+57 300 123 4567` | Sofía Ramírez | Entra con su **teléfono** |
| `diego`, `mateo`, `valentina` | Resto de contactos | |

Todas las cuentas de ejemplo tienen el teléfono verificado (Andrés `+57 300 555 0101`, Camila `…0102`,
Diego `…0103`, Mateo `…0104`, Valentina `…0105` y Laura `+57 310 456 7890`). Laura además tiene
correo de recuperación (`laura@example.com`).

**Registro nuevo**: en `/registro` escribes tu número y llega un código por SMS. Sin OneSignal
configurado, el código aparece en pantalla como «modo de prueba» y en la consola del core. Luego
pones tu nombre, un usuario opcional y la contraseña.

- **Llamada**: entra con `laura` en una ventana y con `andres` en otra (o en una ventana privada) y
  pulsa el botón de video o de teléfono en su chat.
- **Compra**: *Servicios → Mercado*, busca «un kilo de azúcar, arroz», agrega, escribe la dirección y
  pulsa *Pagar con QR*. Escanea el QR con el celular (en la misma red) o pulsa *Pagar desde este
  celular*: se abre la billetera simulada.
- **Delivery con los tres roles** (una ventana privada para cada uno):
  1. `tienda`: *Delivery → Mi negocio*, abre el pedido, *Aceptar pedido* y luego *Listo · llamar a Rapidito*.
  2. `repartidor`: *Delivery → Rapidito · Repartidor*, el pedido aparece en «Para recoger» con lo que
     ganas; ábrelo y *Tomar este pedido*.
  3. `tienda`: cuando el repartidor llega, *Le entregué el pedido a Carlos Huamán*.
  4. El cliente ve su **código de entrega** en el pedido; el repartidor se lo pide y lo escribe en
     *Confirmar entrega*. Sin el código correcto no se puede marcar como entregado.
  Todos lo ven en vivo, con el historial de cada paso, y cualquiera se escribe con los otros desde el
  pedido (cliente ↔ tienda, cliente ↔ repartidor, tienda ↔ repartidor).
- **Reclamo con devolución parcial**: con el pedido entregado, el cliente pulsa *Tengo un problema con
  mi pedido*, elige «Faltaron productos» y cuántos. `soporte` lo abre en *Ajustes → Soporte Parla →
  Reclamos*, ajusta el monto y pulsa *Devolver*: PagaYa devuelve esa parte y el cliente lo ve en el pedido.
- **Nuevo repartidor**: con cualquier cuenta, *Delivery → Trabaja con Rapidito*, con DNI, licencia y
  foto del documento. Queda en revisión hasta que `soporte` lo apruebe en *Repartidores*.

## Qué tiene esta versión

**Un solo espacio, como WhatsApp**
- Te registras y ya puedes escribirle a **cualquier persona de Parla**: el directorio busca por nombre,
  usuario o teléfono. Sin espacios de trabajo, invitaciones ni roles de equipo.
- Los grupos los administra quien los crea, que es quien puede agregar personas.
- Navegación: **Chats · Servicios · Ofertas · Delivery**, y **Ajustes** en el avatar del perfil. En el
  escritorio va en una barra lateral; en el celular, abajo.

**Servicios (super-app)**
- **Mercado** (tienda MercaYa): escribes la lista como la dices («un kilo de azúcar, arroz y leche») y
  Parla busca cada cosa. Tarjetas con precio, carrito con cantidades y dirección de entrega.
- **Total transparente**: el gateway pide los precios a la tienda y la tarifa al delivery, y suma
  *Productos + Delivery = Total* antes de pagar. Nunca usa los precios que mande el navegador.
- **Pago con QR tipo Yape** (billetera PagaYa): QR en pantalla, cuenta regresiva del cobro y botón para
  pagar desde el mismo celular. El aviso de pago llega firmado al gateway.
- **Delivery Rapidito** (tu propia flota, al estilo de PedidosYa y Rappi), para los tres lados:
  - **Cliente**: el pedido avanza en vivo (*Pago → Preparando → Repartidor → En camino → Entregado*)
    con el nombre y la moto del repartidor, un **código de entrega de 4 dígitos** (como el PIN de
    Rappi) y el historial con la hora de cada paso. Le llega un push en cada etapa.
  - **Dueño del negocio** (*Delivery → Mi negocio*): le llegan los pedidos pagados (con push), los
    acepta o rechaza, avisa cuando están listos, ve qué repartidor viene y **confirma que se lo
    entregó** (como «Despachado» en PedidosYa). Al final ve la **constancia**: entregado a quién, a qué
    hora y confirmado con el código del cliente. Pestañas Nuevos · Preparando · Con Rapidito · Terminados.
  - **Mi tienda**: el dueño ve si está abierta, puede **pausar los pedidos** («Recibir pedidos») y
    fijar el **horario** (hora de Lima, también nocturno o 24 horas). Cerrada, el cliente ve el aviso
    y el gateway no cotiza ni cobra. En **Catálogo y precios** cambia el precio, pone o quita la
    **oferta** (precio normal tachado) y el **stock** (o lo marca agotado de un toque); se guarda en el
    sistema de la tienda y se ve al instante en Mercado y Ofertas.
  - **Registro de repartidores**: cualquiera entra a *Delivery → Trabaja con Rapidito*, elige su
    vehículo (moto, bicicleta, auto o a pie) y su placa, escribe su **DNI** (y su **licencia** si maneja
    moto o auto) y sube la **foto del documento**. Queda **en revisión** hasta que soporte lo apruebe;
    mientras tanto no puede conectarse. Si lo rechazan ve el motivo y vuelve a enviar la foto. Ya
    aprobado, en su perfil se **conecta o desconecta** (solo a los conectados les llegan pedidos),
    cambia el vehículo, ve sus **ganancias** (hoy, 7 días y total) y puede **dejar de repartir** (su
    historial queda y, si vuelve, no repite la verificación).
  - **Ofertas por cercanía y tarifa por distancia**: un pedido listo se ofrece primero a los
    repartidores a menos de 3 km de la tienda; si nadie lo toma en 2 minutos, se amplía a 6 km, luego
    a 12 km y al final a todos los conectados (`DISPATCH_RADII_KM`, `DISPATCH_WAVE_MINUTES`). Para
    eso el celular del repartidor conectado manda su ubicación cada 30 s (no se comparte con nadie).
    Cada oferta muestra a cuántos km está la tienda. La tarifa de delivery depende de la distancia de
    la tienda a la dirección (el carrito la muestra).
  - **Entrega con foto**: el repartidor puede adjuntar una foto al entregar con el código; si el
    cliente no responde, **lo deja con una foto** como prueba («Dejado sin código»). El cliente, la
    tienda y soporte ven la foto (privada: solo se sirve con sesión).
  - **Reclamos y devoluciones parciales**: hasta 48 horas después de recibirlo, el cliente reporta
    *Faltaron productos · Llegó dañado · Llegó otro producto · No me llegó · Otro*, marca qué productos
    y cuántos (la devolución sugerida es lo que costaron), con comentario y foto. Soporte decide el
    monto y **PagaYa devuelve esa parte** del cobro (con referencia única, nunca dos veces ni más de
    lo pagado), o lo cierra con un motivo. El cliente ve el estado en el pedido y la tienda, el reclamo.
  - **Panel de soporte** (*Ajustes → Soporte Parla*, solo cuentas de soporte): repartidores por
    revisar con su DNI, licencia y foto del documento para **aprobar o rechazar**, y la bandeja de
    **reclamos** con las fotos del cliente y de la entrega para devolver o rechazar.
  - **Propina**: en el carrito el cliente elige S/ 1, 2, 3, 5 u otro monto; se cobra en el mismo QR
    y va completa al repartidor (que la ve en la oferta y en sus ganancias).
  - **Ganancias del repartidor y comisión automática**: el repartidor gana el **95 % de la tarifa de
    delivery** y el **100 % de la propina**; Rapidito se queda con el 5 %. El cliente paga todo en un
    solo cobro a la plataforma, así que la comisión **se descuenta sola**: cada entrega anota en el
    libro de movimientos del repartidor + tarifa, − comisión y + propina (una sola vez, aunque se
    confirme dos veces). En la oferta y en la entrega ve el detalle («Para ti S/ …»).
    El porcentaje y los mínimos se configuran con `DRIVER_SHARE_PERCENT` (95 por defecto, de 50 a
    100), `DRIVER_MIN_AUTO_PAYOUT_SOLES` (5) y `DRIVER_MIN_MANUAL_PAYOUT_SOLES` (1); un valor inválido
    no deja arrancar el core. Cambiarlos no toca lo que ya está anotado en los libros.
  - **Depósitos a PagaYa**: en su perfil el repartidor pone su número de PagaYa, ve su **saldo** y
    sus movimientos, y puede **retirar ahora**. Además, el gateway le **deposita automáticamente cada
    día a las 23:00** (hora de Lima) si tiene S/ 5 o más (`RAPIDITO_PAYOUT_AT`). El retiro primero
    reserva el saldo en el core, luego transfiere con PagaYa usando el id del depósito como referencia
    (PagaYa no la paga dos veces) y recién entonces lo confirma; si PagaYa falla, el saldo vuelve. Cada
    hora se concilian los depósitos que quedaron sin confirmar.
  - **Calificaciones**: al recibir el pedido, el cliente califica al repartidor y a la tienda (1 a 5
    estrellas y un comentario). La tienda la ve en el pedido y su promedio en «Mi tienda»; el
    repartidor, su promedio en su perfil.
  - **Vigilancia automática** (cada minuto): un pedido listo que nadie toma en 5 minutos se vuelve a
    ofrecer y se avisa a la tienda; si el repartidor no lo recoge en 25 minutos o su celular deja de
    mandar ubicación 8 minutos, el pedido se le quita y se ofrece a otros (con aviso a él y anotado en
    el historial). Los tiempos se cambian con `DELIVERY_*` en `apps/api/.env`.
  - **Mapa en vivo** (OpenStreetMap): el cliente marca en el carrito dónde le entregan; mientras dura
    la entrega, el celular del repartidor comparte su ubicación (solo con el cliente y la tienda de ese
    pedido) y ambos lo ven moverse **por la ruta de las calles** (OSRM), con la distancia que falta,
    la hora estimada según esa ruta y un aviso si se queda sin señal. El repartidor ve la ruta a la
    tienda y al cliente. Si el servicio de rutas no responde, se usa la línea recta.
  - **Repartidor** (*Delivery → Rapidito · Repartidor*): ve los pedidos listos con la tienda, el destino
    y lo que gana; el primero que lo toma se lo queda (una entrega a la vez). Recoge en la tienda y
    entrega **solo con el código del cliente**: con 5 códigos equivocados se bloquea, para que no se
    pueda adivinar.
  - **Chat del pedido**: cliente, tienda y repartidor se escriben entre ellos desde el pedido, en los
    dos sentidos, con el chat cifrado de siempre. El core solo dice quién es la otra parte, y solo a
    quienes participan en ese pedido.
  - El código lo ve solo el cliente: ni la tienda ni el repartidor lo reciben del servidor. Si se
    bloquea por intentos equivocados, el cliente genera uno nuevo desde el pedido.
  - **Cancelar y devolver**: el cliente cancela mientras la tienda no lo acepte; la tienda lo rechaza
    o lo cancela después de aceptarlo. Si ya estaba pagado, PagaYa devuelve el pago al instante; si
    no, se anula el QR y ya no se puede pagar. Un pago que llega después de cancelar se devuelve solo.
  - **Si el repartidor no puede**: lo suelta antes de recogerlo («No puedo llevarlo») o la tienda pide
    otro («No llega · buscar otro»); el pedido vuelve a ofrecerse a los demás repartidores.
  - **Hora estimada de llegada** con el tiempo que cotiza Rapidito, que se ajusta al recoger el pedido.
- **Mis pedidos**: historial con el estado de cada uno.
- **Salud**: aparece como «Próximamente». La arquitectura ya permite sumarlo con su propio traductor.

**Registro con el teléfono verificado (como WhatsApp)**
- **Paso 1:** tu número, con el país. Te llega un **código de 6 cifras por SMS con OneSignal**.
- **Paso 2:** escribes el código. En Android con Chrome se completa solo (WebOTP).
  - El código vence en 10 minutos y admite 5 intentos.
  - Puedes pedir uno nuevo cada minuto, hasta 5 por hora.
- **Paso 3:** nombre, **usuario opcional** y contraseña.
  - El usuario se pone o se cambia después en *Ajustes*.
  - La contraseña protege tus claves de cifrado.
- **Bienvenida** (todo opcional):
  - **foto de perfil**, recortada y sin datos de ubicación;
  - **correo de recuperación**, verificado con un código;
  - **tus contactos del teléfono**: ves quiénes ya están en Parla para escribirles, e invitas a los demás.
- **Contactos** también en *Nuevo chat → Contactos*:
  - en Chrome para Android se leen de la libreta (Contact Picker API);
  - en otros navegadores se escriben o se pegan los números;
  - los números no se guardan.
- **¿Olvidaste tu contraseña?** Llega un código al correo verificado y pones una contraseña nueva.
  - Como la clave de cifrado dependía de la contraseña anterior, se crean claves nuevas.
  - Tus contactos ven «X restableció su cuenta» y deciden si te vuelven a **compartir el chat**;
    cuando lo hacen, recuperas el historial.

**Perfil**
- Inicio de sesión con teléfono o usuario y contraseña.
- Aceptación de términos y política de privacidad (Ley 1581 / LGPD) con versión y fecha registradas.
- **Ajustes** ordenados al estilo WhatsApp: tarjeta del perfil y secciones (Privacidad, Tus datos,
  Apariencia, Chats, Notificaciones), cada una en su propia pantalla.

**Chat individual y grupal**
- Mensajes en **tiempo real** (Elixir, por WebSocket a través del gateway en Go), con estados
  **enviado ✓ → entregado ✓✓ → leído ✓✓ (cian)**. En grupos se muestra el estado del destinatario más atrasado.
- Fotos y videos con comentario, **notas de voz** grabadas en el navegador, visor de imágenes.
- «Escribiendo…», presencia, no leídos, búsqueda y filtros, historial ilimitado.
- Grupos: crear, agregar personas, salir; avisos de sistema. Envío optimista con reintento.

**Llamadas de voz y video**
- Botones de **videollamada** y **llamada de voz** en cada chat (individual o grupal, hasta 8 personas).
- Llamada entrante con timbre, contestar o rechazar.
- Pantalla de llamada con el video de cada persona, vista propia, temporizador, **silenciar**,
  **apagar la cámara** y colgar.
- **WebRTC P2P cifrado (DTLS-SRTP)**: el servidor solo coordina la llamada (un proceso de Elixir por
  llamada).
- Al terminar queda el registro en el chat («🎥 Videollamada · 3:05», «📞 Llamada de voz perdida»).

**Colaboración**
- **Hilos**, respuestas citadas y **menciones con @**.
- **Notificaciones** del sistema y **Web Push** con la app cerrada (sin contenido, por el cifrado E2E).

**Legal y datos personales**
- **Términos y condiciones** (servicios de terceros, sin cobros automáticos, reclamos) y **Política de
  privacidad** (qué datos se comparten con la tienda, el delivery y la billetera).
- **Descargar mis datos** (incluye cuántos pedidos hiciste) y **eliminar la cuenta**: se anonimiza,
  sale de sus chats y se borra su historial de pedidos.
- Revisión de seguridad en **[SECURITY.md](SECURITY.md)**.

## Cómo está hecho

```
                              ┌──────────────────┐── HTTP (REST) ─────────────► core NestJS (4101)
 navegador ── HTTPS /api ────►│   gateway  Go    │                                 ▲  │ /internal/publish
            ── WSS  /ws  ────►│     (4100)       │── WebSocket /link ─────────► tiempo real Elixir (4102)
                              │  traductores +   │── traductor mercaya ───────► MercaYa  (tienda)    ┐
   billetera ─/hooks/pagaya ─►│  orquestador     │── traductor rapidito  ───────► Rapidito (tarifa)    ├ 4103
   (aviso firmado)            └──────────────────┘── traductor pagaya  ───────► PagaYa   (billetera) ┘
```

- **Gateway (Go)**: única puerta pública. Valida el JWT y limita peticiones.
  - **Traductores** (`internal/translators/<app>`): uno por cada sistema con el que habla (chat,
    tienda, delivery, billetera). Cada uno convierte el formato de ese sistema en *payloads* limpios:
    solo campos conocidos, tipos y tamaños validados, firmas verificadas, y el usuario sale del token.
  - **Orquestador de pedidos** (`internal/orders`): recotiza, reserva, cobra, despacha y sigue cada pedido.
- **Tiempo real (Elixir/OTP)**: conexiones, presencia, «escribiendo…» y un proceso por llamada.
- **Core (NestJS)**: la lógica de negocio y la base de datos (usuarios, chats, pedidos).
  Publica cada cambio al tiempo real (p. ej. `order:updated`).
- Protocolos: [tiempo real](docs/architecture/realtime-protocol.md) · [servicios](docs/architecture/services-protocol.md).

Monorepo con npm workspaces:

```
services/
  gateway/    Go — API gateway / orquestador: REST, WebSocket, traductores, pedidos, webhooks
  realtime/   Elixir — tiempo real y llamadas (OTP: Registry, un GenServer por llamada)
  providers/  Go — simuladores de las APIs externas: MercaYa, Rapidito y PagaYa
apps/
  api/   NestJS + Prisma (core) — Screaming Architecture + Ports & Adapters
         src/modules/{members,platform}  ·  src/infra/{prisma,identity,storage,realtime,push}
  web/   React + Vite + Tailwind — módulos con components/ hooks/ const/ types/ utils/
         src/modules/{auth,chats,calls,services,settings,legal,shell}
packages/
  types/   @parla/types — contratos compartidos (fuente única), incluidos los de Servicios
  crypto/  @parla/crypto — cifrado de extremo a extremo
```

Las decisiones de tecnología, una por una y con su porqué, están en **[DECISIONES.md](DECISIONES.md)**.

## Despliegue a producción

**Opción A — Docker + PostgreSQL** (servidor propio, VPS, Render, Fly, Railway):

```bash
cp .env.production.example .env.production   # completa PUBLIC_URL, POSTGRES_PASSWORD, secretos…
docker compose --env-file .env.production up -d --build
```

Levanta `gateway` (8080), `providers` (8081, la página de pago que abre el QR), `core`, `realtime` y
`db`. Los avisos de pago y delivery viajan por la red interna. El core compila el esquema PostgreSQL y
sincroniza la base al arrancar. Pon delante un proxy con HTTPS (Caddy, Nginx, Traefik o el del proveedor).

**Opción B — sin Docker**: `npm run start:prod`. Usa la base de `DATABASE_URL` (SQLite por defecto),
genera los secretos (sesiones, token entre servicios y firmas de los avisos) en `apps/api/.secrets/`
si no los defines, y el gateway sirve todo en el puerto `PORT` (4100).

En producción ningún servicio arranca con secretos de desarrollo:
- `JWT_SECRET` debe tener 32+ caracteres;
- `INTERNAL_TOKEN` y `PAGAYA_WEBHOOK_SECRET`, 24+.

El core además envía cabeceras de seguridad con helmet (CSP estricta, HSTS, `nosniff`,
`frame-ancestors 'none'`).

Variables completas en `apps/api/.env.example` y `.env.production.example`.

## Pruebas

- **Unitarias (Vitest, 95)**:
  - cifrado E2E (7);
  - core (60): **registro con código por SMS** (envío sin código en claro, modo de prueba solo en desarrollo, reenvíos, intentos, vencimiento, comprobante de un solo uso), usuario opcional, correo verificado, foto solo JPEG, contactos con indicativo propio, **recuperación por correo** sin revelar cuentas y volver a compartir la clave del chat; estados de entrega, permisos, inicio de sesión, hilos, menciones, push, puente con el tiempo real, datos personales, y **pedidos**: montos que
    cuadran, transiciones que nunca retroceden, aviso de pago repetido sin efecto, cada quien ve solo
    sus pedidos, push en cada etapa;
  - web (28): países e indicativos; incluye entender «un kilo de azúcar, arroz» como dos búsquedas.
- **Gateway (Go, 36)**:
  - JWT, límite de peticiones y traductor del chat;
  - traductores de tienda, delivery y billetera: respuestas inválidas, firmas válidas y falsificadas;
  - orquestador: suma correcta que ignora precios del navegador (con la tarifa de Rapidito), el pago
    espera al negocio, aviso repetido sin efecto, cobro vencido;
  - rutas sin sesión → 401.
- **Simuladores (Go, 11)**: búsqueda, stock, cobros con vencimiento, pago idempotente y avisos firmados.
- **Tiempo real (Elixir, 17)**: llamadas y el enlace con el gateway.
- **Punta a punta (Playwright, 17 recorridos, navegador real, con los cinco procesos)**:
  - chat cifrado, fotos y notas de voz;
  - videollamada real por WebRTC y llamada rechazada;
  - menciones, hilos y push;
  - **registro con código por SMS**, foto, correo verificado y **contactos del teléfono** (libreta simulada): encuentra a Laura y conversan;
  - **recupera la cuenta con el correo**: claves nuevas, chat bloqueado hasta que Andrés se lo vuelve a compartir, y lee de nuevo el historial;
  - **compra completa con los tres roles**: busca, carrito, total, QR, pago en PagaYa; la tienda acepta y se escriben por el chat del pedido en los dos sentidos; la tienda lo alista, el repartidor lo toma, la tienda se lo entrega, un código equivocado no entrega y el de la clienta sí; todos lo ven en vivo y la tienda queda con la constancia;
  - el gateway rechaza precios manipulados;
  - legal, exportar y eliminar la cuenta;
  - vista de celular.

## Qué falta

- **OneSignal real**: el adaptador sigue la API de mensajes (canales SMS y correo), pero no se
  probó con una cuenta de verdad, porque necesita credenciales y un número emisor de Twilio (con
  costo). Se configura con `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` y `ONESIGNAL_SMS_FROM`.
- **Contactos en iPhone y escritorio**: esos navegadores no permiten leer la libreta, así que ahí se
  escriben los números. Una app nativa (o la PWA empaquetada) podría leer la libreta completa.
- **Proveedores reales**: la tienda, el delivery y la billetera son simuladores. Para salir al aire
  hay que firmar con proveedores reales (p. ej. un supermercado con API, Rappi/PedidosYa/flota propia,
  Yape Empresas/Niubiz/Culqi) y escribir su traductor en el gateway. El resto no cambia.
- **Salud**: el servicio aparece como «Próximamente».
- **Pedido fallido a medias**: si guardar en el core falla después de reservar en la tienda y crear el
  cobro, no se deshace (en producción: una saga con compensaciones o una cola).
- **Fase 2 de la arquitectura**: pasar la web a **Next.js**.
- **Probado en esta PC sin Docker**: los `Dockerfile` y el `docker-compose.yml` no se pudieron
  construir aquí; el modo producción sí se probó sin Docker.
- **Llamadas**: TURN propio para redes muy restrictivas, compartir pantalla, SFU para grupos grandes.
- **Delivery**: en producción, un servidor de mapas y de rutas propio o con clave (las teselas y OSRM
  públicos tienen límites de uso), y la billetera real de pagos (PagaYa es un simulador).
- **Negocios**: se registran y administran en el sistema de producción de cada negocio; Parla solo
  los consulta y procesa sus pedidos.
- **Ofertas de restaurantes y salud**: son una vitrina de ejemplo; todavía no se pueden pedir.
- **Seguridad**: rotación de la clave del grupo cuando alguien sale, clave privada no extraíble en
  IndexedDB, auditoría externa.
- **Escala**: varios nodos de Elixir en clúster y varios gateways; presencia del core en Redis;
  archivos en S3/R2; colas para los avisos de los proveedores.
