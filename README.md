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
| **Gateway** (Go) | http://localhost:4100 — `/api`, `/ws`, `/hooks`, salud en `/gateway/health` | la única puerta del backend |
| Core (NestJS) | http://localhost:4101/api | solo el gateway y el tiempo real |
| Tiempo real (Elixir) | http://localhost:4102 | solo el gateway y el core |
| APIs externas simuladas | http://localhost:4103 — MercaYa (tienda), MotoYa (delivery), PagaYa (billetera) | el gateway, y la página de pago que abre el QR |

Los puertos se pueden cambiar con `PARLA_WEB_PORT`, `PARLA_GATEWAY_PORT`, `PARLA_CORE_PORT`,
`PARLA_REALTIME_PORT` y `PARLA_PROVIDERS_PORT`. `MOTOYA_STEP_MS` (4000 por defecto) controla cuánto
tarda el delivery simulado en cada paso.

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
| `laura` | Laura Méndez | La más activa: grupos, chats, tareas asignadas |
| `andres` | Andrés Rojas | Para chatear o llamar a Laura |
| `camila` | Camila Torres | Creó (y administra) el grupo «Diseño tienda en línea» |
| `+57 300 123 4567` | Sofía Ramírez | Entra con su **teléfono** |

Todas las cuentas de ejemplo tienen el teléfono verificado (Andrés `+57 300 555 0101`, Camila `…0102`,
Diego `…0103`, Mateo `…0104`, Valentina `…0105` y Laura `+57 310 456 7890`). Laura además tiene
correo de recuperación (`laura@example.com`).

**Registro nuevo**: en `/registro` escribes tu número y llega un código por SMS. Sin OneSignal
configurado, el código aparece en pantalla como «modo de prueba» y en la consola del core. Luego
pones tu nombre, un usuario opcional y la contraseña.
| `diego`, `mateo`, `valentina` | Resto de contactos | |

- **Llamada**: entra con `laura` en una ventana y con `andres` en otra (o en una ventana privada) y
  pulsa el botón de video o de teléfono en su chat.
- **Compra**: *Servicios → Mercado*, busca «un kilo de azúcar, arroz», agrega, escribe la dirección y
  pulsa *Pagar con QR*. Escanea el QR con el celular (en la misma red) o pulsa *Pagar desde este
  celular*: se abre la billetera simulada; al pagar, el pedido pasa solo a «Buscando motorizado», «En
  camino» y «Entregado».

## Qué tiene esta versión

**Un solo espacio, como WhatsApp**
- Te registras y ya puedes escribirle a **cualquier persona de Parla**: el directorio busca por nombre,
  usuario o teléfono. Sin espacios de trabajo, invitaciones ni roles de equipo.
- Los grupos los administra quien los crea, que es quien puede agregar personas.
- Navegación: **Chats · Servicios · Tareas · Ajustes**. En el escritorio va en una barra lateral; en
  el celular, abajo.

**Servicios (super-app)**
- **Mercado** (tienda MercaYa): escribes la lista como la dices («un kilo de azúcar, arroz y leche») y
  Parla busca cada cosa. Tarjetas con precio, carrito con cantidades y dirección de entrega.
- **Total transparente**: el gateway pide los precios a la tienda y la tarifa al delivery, y suma
  *Productos + Delivery = Total* antes de pagar. Nunca usa los precios que mande el navegador.
- **Pago con QR tipo Yape** (billetera PagaYa): QR en pantalla, cuenta regresiva del cobro y botón para
  pagar desde el mismo celular. El aviso de pago llega firmado al gateway.
- **Delivery** (MotoYa): al confirmarse el pago, el gateway pide la moto. El pedido avanza en vivo
  (*Pago → Motorizado → En camino → Entregado*) con nombre del motorizado y tiempo estimado, y te llega
  un push si no tienes Parla abierta.
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
- **Tareas asignables** en los chats, con responsable y fecha, y vista **Mis tareas**.
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
 billetera / delivery ─/hooks►│  orquestador     │── traductor motoya  ───────► MotoYa   (delivery)  ├ 4103
   (avisos firmados)          └──────────────────┘── traductor pagaya  ───────► PagaYa   (billetera) ┘
```

- **Gateway (Go)**: única puerta pública. Valida el JWT y limita peticiones.
  - **Traductores** (`internal/translators/<app>`): uno por cada sistema con el que habla (chat,
    tienda, delivery, billetera). Cada uno convierte el formato de ese sistema en *payloads* limpios:
    solo campos conocidos, tipos y tamaños validados, firmas verificadas, y el usuario sale del token.
  - **Orquestador de pedidos** (`internal/orders`): recotiza, reserva, cobra, despacha y sigue cada pedido.
- **Tiempo real (Elixir/OTP)**: conexiones, presencia, «escribiendo…» y un proceso por llamada.
- **Core (NestJS)**: la lógica de negocio y la base de datos (usuarios, chats, tareas, pedidos).
  Publica cada cambio al tiempo real (p. ej. `order:updated`).
- Protocolos: [tiempo real](docs/architecture/realtime-protocol.md) · [servicios](docs/architecture/services-protocol.md).

Monorepo con npm workspaces:

```
services/
  gateway/    Go — API gateway / orquestador: REST, WebSocket, traductores, pedidos, webhooks
  realtime/   Elixir — tiempo real y llamadas (OTP: Registry, un GenServer por llamada)
  providers/  Go — simuladores de las APIs externas: MercaYa, MotoYa y PagaYa
apps/
  api/   NestJS + Prisma (core) — Screaming Architecture + Ports & Adapters
         src/modules/{members,platform}  ·  src/infra/{prisma,identity,storage,realtime,push}
  web/   React + Vite + Tailwind — módulos con components/ hooks/ const/ types/ utils/
         src/modules/{auth,chats,calls,tasks,services,settings,legal,shell}
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
- `INTERNAL_TOKEN`, `PAGAYA_WEBHOOK_SECRET` y `MOTOYA_WEBHOOK_SECRET`, 24+.

El core además envía cabeceras de seguridad con helmet (CSP estricta, HSTS, `nosniff`,
`frame-ancestors 'none'`).

Variables completas en `apps/api/.env.example` y `.env.production.example`.

## Pruebas

- **Unitarias (Vitest, 95)**:
  - cifrado E2E (7);
  - core (60): **registro con código por SMS** (envío sin código en claro, modo de prueba solo en desarrollo, reenvíos, intentos, vencimiento, comprobante de un solo uso), usuario opcional, correo verificado, foto solo JPEG, contactos con indicativo propio, **recuperación por correo** sin revelar cuentas y volver a compartir la clave del chat; estados de entrega, permisos, inicio de sesión, hilos, menciones, tareas (administra el
    grupo quien lo creó), push, puente con el tiempo real, datos personales, y **pedidos**: montos que
    cuadran, transiciones que nunca retroceden, aviso de pago repetido sin efecto, cada quien ve solo
    sus pedidos, push en cada etapa;
  - web (28): países e indicativos; incluye entender «un kilo de azúcar, arroz» como dos búsquedas.
- **Gateway (Go, 36)**:
  - JWT, límite de peticiones y traductor del chat;
  - traductores de tienda, delivery y billetera: respuestas inválidas, firmas válidas y falsificadas;
  - orquestador: suma correcta que ignora precios del navegador, pago → despacho del delivery, aviso
    repetido sin efecto, cobro vencido;
  - rutas sin sesión → 401.
- **Simuladores (Go, 11)**: búsqueda, stock, cobros con vencimiento, pago idempotente y avisos firmados.
- **Tiempo real (Elixir, 17)**: llamadas y el enlace con el gateway.
- **Punta a punta (Playwright, 17 recorridos, navegador real, con los cinco procesos)**:
  - chat cifrado, fotos y notas de voz;
  - videollamada real por WebRTC y llamada rechazada;
  - menciones, hilos, tareas y push;
  - **registro con código por SMS**, foto, correo verificado y **contactos del teléfono** (libreta simulada): encuentra a Laura y conversan;
  - **recupera la cuenta con el correo**: claves nuevas, chat bloqueado hasta que Andrés se lo vuelve a compartir, y lee de nuevo el historial;
  - **compra completa**: busca, carrito, total, QR, pago en PagaYa y delivery hasta «Entregado», en vivo;
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
- **Seguridad**: SMS/OTP para el teléfono, rotación de la clave del grupo cuando alguien sale, clave
  privada no extraíble en IndexedDB, recuperación de cuenta, auditoría externa.
- **Escala**: varios nodos de Elixir en clúster y varios gateways; presencia del core en Redis;
  archivos en S3/R2; colas para los avisos de los proveedores.
