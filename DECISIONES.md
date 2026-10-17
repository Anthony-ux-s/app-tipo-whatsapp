# Decisiones técnicas — Parla

**Parla** es la primera versión de la app de mensajería para equipos descrita en `INVESTIGACION.md`:
un chat tipo WhatsApp organizado por espacios de trabajo y con cifrado de extremo a extremo.

## Cómo se decidió

La investigación recomienda el *Stack 2* (React + Supabase). Las guías de `docs/architecture/`
piden un backend **NestJS + Prisma** con *Ports & Adapters* y un front React con *Screaming
Architecture*. Cuando chocan, **mandan las guías**, así que Supabase queda fuera de la primera
versión y lo que aportaba (auth, base de datos y tiempo real) se cubre con piezas libres detrás de
un puerto. Cambiar a Supabase más adelante es un adaptador nuevo y una línea de configuración.

## Stack, pieza por pieza

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Lenguaje | **TypeScript** en todo el monorepo | Un solo lenguaje y contratos compartidos entre web y API (`@parla/types`). |
| Monorepo | **npm workspaces** (`apps/*`, `packages/*`) | Viene con Node; no hace falta instalar nada más (Nx/pnpm). |
| Frontend | **React 19 + Vite + Tailwind CSS 4** | Lo pide la investigación y encaja con la guía web (módulos con `components/hooks/const/types/utils`). |
| Estado en el front | **Zustand** | Store mínimo para la sesión y el chat; la lógica vive en los hooks, como exige la guía. |
| Enrutado | **React Router** | Estándar, permite la vista móvil de lista → conversación con botón de volver. |
| Íconos | **Lucide** | Línea fina de 2px, tal como pide el diseño. |
| Backend | **NestJS 11** | Lo exige la guía de backend (controllers que solo orquestan, use-cases, puertos). |
| ORM | **Prisma 6** | Lo exige la guía; el esquema es la fuente de verdad de la persistencia. |
| Base de datos (desarrollo) | **SQLite embebida** (archivo en `apps/api/prisma/dev.db`) | Arranca en esta PC sin instalar servicios; solo los adaptadores Prisma la conocen. |
| Base de datos (producción) | **PostgreSQL** (Supabase, Neon o propio) | `npm run db:postgres-schema -w @parla/api` genera `schema.postgres.prisma` con el proveedor cambiado; basta `DATABASE_URL`. |
| Inicio de sesión | **Propio: teléfono o nombre de usuario + contraseña**, hash con **bcryptjs** y **JWT** | Gratis y sin servicios externos. Puerto `PasswordHasher`/`TokenService` en `infra/identity`, intercambiable por Supabase Auth. |
| Tiempo real | **Elixir/OTP** (servicio propio) detrás del **gateway en Go**; el core publica por el puerto `RealtimePublisher` | Ver «Arquitectura de servicios» al final. (Hasta la Fase 4 era Socket.IO dentro de Nest.) |
| Cifrado de extremo a extremo | **WebCrypto** (ECDH P-256 + HKDF + AES-GCM 256), paquete `@parla/crypto` | Nativo del navegador y de Node, sin dependencias. El servidor solo guarda texto y archivos cifrados. Ver detalle abajo. |
| Archivos (fotos, audio, vídeo) | **Disco local** (`apps/api/storage/`) detrás del puerto `FileStorage` | Gratis en desarrollo; en producción se cambia por S3/R2/Supabase Storage con un adaptador. Los archivos se suben ya cifrados. |
| Notas de voz | **MediaRecorder** del navegador | Sin librerías; graba `audio/webm` y se cifra antes de subir. |
| Mapas | No aplica | El rubro (mensajería) no lo necesita en esta versión. |
| PWA | **vite-plugin-pwa** | Instalable en el celular (manifest + service worker), sin app nativa: la investigación no exige una. |
| Pruebas | **Vitest** (lógica) + **Playwright** (recorrido de punta a punta) | Libres, rápidos, y Playwright prueba con un navegador real y peticiones reales. |
| Alojamiento | **Web en Vercel o Netlify (estático)**, **API en Render/Fly/Railway (Node)**, **Postgres en Supabase/Neon** | Todos tienen capa gratuita. La API necesita un proceso Node persistente por los WebSockets. |

## Puertos usados en esta versión

`3100` para la web (Vite), `4100` para el gateway (la única puerta del backend), `4101` para el core
(NestJS) y `4102` para el tiempo real (Elixir). Los puertos 3000, 3005 y 4317 están ocupados en esta
PC y no se usan.

## El cifrado de extremo a extremo

1. Cada usuario tiene un par de claves **ECDH P-256**. La clave pública se publica en el servidor.
   La privada se guarda en el servidor **cifrada con una clave derivada de su contraseña**
   (PBKDF2-SHA256, 210 000 iteraciones), igual que un “respaldo de claves”: el servidor nunca la ve
   en claro y así el usuario puede entrar desde otro dispositivo.
2. Cada conversación tiene una **clave AES-GCM de 256 bits** aleatoria, creada en el navegador de
   quien inicia el chat. Para cada miembro se “envuelve” con ECDH(privada del que envuelve, pública
   del miembro) → HKDF → AES-GCM, y se guarda solo la versión envuelta.
3. Los mensajes de texto y los archivos se cifran con esa clave antes de salir del navegador
   (IV aleatorio de 12 bytes por mensaje). El servidor guarda y reenvía únicamente texto cifrado.
4. Al agregar a alguien a un grupo, un miembro que ya tiene la clave la envuelve para el nuevo.
5. Los datos de ejemplo se cifran con este mismo esquema desde el script de carga (Node tiene la
   misma API WebCrypto), así que también son de extremo a extremo.

**Límites conocidos de esta versión** (anotados para fases siguientes): la clave privada
descifrada se guarda en `localStorage` del dispositivo para no pedir la contraseña en cada
recarga; no hay rotación de clave al sacar a alguien de un grupo ni verificación de huellas de
seguridad (*safety numbers*) entre contactos. La vista previa del último mensaje se descifra en el
navegador, nunca en el servidor.

## Preguntas de la investigación, respondidas

1. **¿Registro por teléfono o por correo/usuario?** → **Ambos**: el usuario elige teléfono **o**
   nombre de usuario (como pide el módulo de autenticación), siempre con contraseña. Sin SMS en
   esta versión porque sería un servicio de pago; el número queda listo para verificarse por OTP
   más adelante.
2. **¿Solo uso interno o también atención a clientes?** → **Uso interno de equipos** en la
   primera versión. Las bandejas compartidas para clientes están en “Después”.
3. **¿Stripe o MercadoPago?** → No se integra ningún pago en esta versión (Fase 4). Cuando llegue,
   se priorizará **MercadoPago** por el enfoque latinoamericano, detrás de un puerto `PaymentGateway`
   para poder sumar Stripe.

## Otras decisiones

- **Nombre y marca**: *Parla* (“hablar”, corto y fácil de recordar en español). Logo propio en SVG:
  dos burbujas entrelazadas con una marca de verificación, como describe el informe.
- **Paleta**: la guía web restringe la marca a **teal, emerald y cyan**. Los colores de la
  investigación (`#008069`, `#128C7E`, `#25D366`) se adaptan a esa gama: primario teal-700,
  secundario teal-800, acento emerald-500, realces cyan. Los neutros (gris/slate) se usan para
  fondos y texto, que la investigación ya define (`#F0F2F5`, `#111B21`). No se usan rojos ni otros
  colores de marca ajenos; los errores se muestran con ícono y texto en tonos oscuros.
- **Tema oscuro**: incluido como preferencia del usuario, con los mismos tokens de color.
- **Roles**: ya no hay roles de espacio (ver «Super-app» al final). Todos chatean como iguales; en
  un grupo, quien lo crea lo administra (agrega personas).
- **Estados de un mensaje**: `sent` → `delivered` → `read`. En grupos el estado visible es el
  mínimo entre todos los destinatarios (se guarda un recibo por destinatario).
- **Historial**: sin límite de días (la crítica a Slack); se pagina por cursor de 40 en 40.

## Fase 3: hilos, menciones y notificaciones

- **Tareas**: se retiraron por completo (web, core, base de datos y pruebas). La app se enfoca en
  chats y servicios (mercado, ofertas y delivery).
- **Hilos**: un mensaje guarda `replyToId` apuntando siempre a la raíz (hilos de un solo nivel, como
  Slack). La misma respuesta se ve en el chat con la cita y en el panel del hilo.
- **Menciones**: como el texto va cifrado, el navegador envía aparte la lista de ids mencionados. El
  servidor solo conoce *a quién* se menciona (no el texto) y así puede contar menciones sin leer y avisar.
- **Notificaciones push**: **Web Push con VAPID** (librería `web-push`, MIT) detrás del puerto
  `PushSender` en `infra/push`. Gratis, sin Firebase ni cuentas de terceros. Solo se envía push a
  quien no tiene la app abierta; con la app en segundo plano el navegador muestra su propio aviso con el
  texto descifrado. Los push del servidor nunca llevan contenido (sería romper el cifrado E2E).
- **Service worker propio** (`apps/web/src/sw.ts`, estrategia *injectManifest* de vite-plugin-pwa):
  precache de la app y manejo de `push` y `notificationclick`.
- **Límite de intentos**: el inicio de sesión se limita por IP **y** por cuenta (10/min), para frenar la
  fuerza bruta sin bloquear a todo un equipo que comparte IP.

## Fase 4: llamadas, planes, legal y producción

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Llamadas de voz y video | **WebRTC** nativo del navegador, señalización por el mismo **Socket.IO** | Gratis y sin servidores de medios: el audio y el video van P2P, cifrados con DTLS-SRTP, coherente con el cifrado E2E. |
| Llamadas grupales | **Malla P2P** (cada persona envía a todas) con tope de 8 personas | Sin SFU que mantener; funciona bien hasta ~8 personas. Para más, un SFU libre (LiveKit/mediasoup) en una fase futura. |
| STUN / TURN | STUN públicos de Google (gratuitos) y TURN opcional por variables | No requiere credenciales para empezar; TURN propio (coturn) solo si alguna red lo exige. |
| Planes *(retirados en la super-app)* | Por espacio de trabajo, **prepago mensual sin cobros automáticos** (Gratis / Equipo / Empresa) | Coincide con el modelo freemium de la investigación; prepago evita gestionar suscripciones y cobros fallidos. |
| Pasarela *(retirada en la super-app)* | **MercadoPago Checkout Pro** detrás del puerto `PaymentGateway`; **sandbox** por defecto | Enfoque latinoamericano (respuesta a la pregunta 3); el sandbox permite probar todo sin credenciales. Stripe sería otro adaptador. |
| Plan vigente *(retirado)* | Se guarda en el espacio (`plan`, `planExpiresAt`) y se calcula el efectivo al leer | El motor de espacios aplica el límite sin depender del de pagos (evita dependencias circulares). |
| Eliminación de cuenta | **Anonimizar** en vez de borrar la fila | Los demás necesitan la clave pública de quien envolvió la clave de la conversación para seguir leyendo sus chats. |
| Producción | **Un solo proceso**: la API sirve la PWA compilada; **Docker + PostgreSQL** con docker-compose | Menos piezas que operar; mismo origen para cookies, CSP y WebSockets. Render/Fly/Railway o un VPS sirven igual. |
| Seguridad web | **helmet** con CSP estricta (el script de tema salió del HTML para no necesitar `unsafe-inline`) | Mitiga XSS, que es el riesgo principal para claves guardadas en el navegador. |

## Arquitectura de servicios: gateway en Go, tiempo real en Elixir

Pedido explícito: chat en tiempo real en **Elixir**, **Go** como API gateway / orquestador central,
conexión por **WebSocket** y **traductores** en el gateway que envían *payloads* limpios al backend de
cada app; vistas en **Next.js**. Esto reemplaza las guías originales (todo en NestJS) para esas piezas.

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Dónde viven los traductores | **Dentro del gateway**, un paquete por app (`services/gateway/internal/translators/<app>`) | Una capa anticorrupción en un solo binario: sin saltos de red extra ni otro servicio que operar. La interfaz `Translator` permite sacar uno a su propio proceso si algún día lo necesita. |
| Qué limpia el traductor | Solo eventos de una lista blanca; IDs con formato y largo máximo; tamaños (SDP < 100 KB); se re-serializa desde structs tipados (los campos desconocidos se pierden); el usuario lo pone el gateway desde el JWT | El backend nunca recibe lo que el navegador inventó. |
| Protocolos | **WebSocket** para el tiempo real (navegador ↔ gateway y gateway ↔ Elixir); **HTTP** para lo que es pedido/respuesta (gateway → core) | Cada uno donde rinde: REST es más simple de cachear, limitar y depurar; el WebSocket solo donde hay eventos que empujar. |
| Enlace gateway ↔ Elixir | **Un solo WebSocket multiplexado** (`/link`) con token entre servicios; operaciones `open/close/event` y `deliver/ack` | Una conexión por gateway en vez de una por usuario; el gateway queda sin estado de negocio. |
| Qué hace Elixir | Conexiones, presencia, «escribiendo…» y **un GenServer por llamada** (bajo `DynamicSupervisor`); `Registry` con claves únicas para «ocupado» sin carreras; caché ETS de 30 s para los permisos | OTP está hecho para esto: millones de procesos livianos, aislamiento de fallos (si una llamada falla, solo cae esa) y temporizadores por proceso. |
| Qué sigue en NestJS | Toda la lógica de negocio y la base de datos (**core**); el tiempo real le consulta permisos y le avisa la presencia por `/api/internal/*` | Patrón *strangler*: se mueve primero lo que más gana con el cambio (tiempo real) sin reescribir lo que ya funciona y está probado. |
| Seguridad entre servicios | `INTERNAL_TOKEN` (comparación en tiempo constante) en `/link`, `/internal/publish` y `/api/internal/*`; el gateway responde 404 a `/api/internal/*` | Las rutas internas no existen hacia fuera aunque alguien adivine la URL. |
| Orden del cambio | **Fase 1** (hecha): Elixir + gateway + traductor del chat, con la web actual y las 17 pruebas E2E como red de seguridad. **Fase 2**: la web a Next.js. **Fase 3**: los backends de las otras apps, cada una con su traductor | Cambiar backend y frontend a la vez dejaría sin forma de saber qué rompió qué. |
| Librerías | Go: `coder/websocket` (única dependencia), JWT HS256 propio con la biblioteca estándar. Elixir: Bandit + Plug + WebSockAdapter + Jason + Req | Pocas dependencias, mantenidas y sin servicios externos. |

## Super-app: un solo espacio y Servicios (estilo WeChat)

Pedido explícito: quitar los espacios de trabajo («que sea uno solo, como WhatsApp») y agregar
servicios dentro de la app, como WeChat o los servicios de Yape. Ejemplo pedido: un cliente busca
«un kilo de azúcar, arroz», paga con un QR tipo Yape, otra API manda un delivery en moto, y Parla
suma el delivery y el costo de los productos.

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Espacios de trabajo | **Eliminados** de la base, la API y la web (no escondidos). Cualquiera le escribe a cualquiera; directorio en `GET /people` | Es el modelo de WhatsApp que se pidió. Dejar un «espacio global» oculto sería deuda: lógica muerta que alguien tendría que entender. |
| Planes por espacio y MercadoPago | **Retirados** | Cobraban por espacio y por miembros; sin espacios no tienen sentido. El cobro ahora es por pedido, con la billetera. |
| Administración de grupos | Quien crea el grupo lo administra | Igual que WhatsApp, sin tabla nueva: `createdById` ya existía. |
| Quién orquesta un pedido | El **gateway (Go)**, en `internal/orders` | El gateway ya era el orquestador central. Hablar con tres sistemas externos y coordinarlos es justo su trabajo; el core no necesita conocer a ningún proveedor. |
| Dónde se guardan los pedidos | En el **core** (tabla `Order`), vía `/api/internal/orders` | Una sola base de datos, el historial junto a la cuenta (exportar, eliminar), y los avisos al cliente salen por el mismo camino que los mensajes (core → Elixir). |
| Traductores por proveedor | `mercaya`, `rapidito` y `pagaya` en `internal/translators` | Cada API externa tiene su formato (español con céntimos, inglés con montos en texto, soles con decimales). El traductor lo convierte a contratos limpios en céntimos. Cambiar de proveedor real = escribir un traductor nuevo. |
| Precios | El gateway **recotiza siempre con la tienda** (al cotizar y al crear); el core **verifica** que los montos cuadren | El navegador solo manda productos y cantidades: no puede bajar un precio. Defensa en profundidad. |
| Avisos de pago | Webhook a `/hooks/pagaya` con **firma HMAC-SHA256** (comparación en tiempo constante) | Es como notifican Yape/Niubiz/Culqi. Sin firma válida → 401. El delivery ya no avisa por webhook: lo hacen los repartidores de Parla desde el core. |
| Idempotencia | Transiciones con `expectStatus` (comparar y cambiar atómico) y estados que **nunca retroceden** | Los proveedores reintentan los avisos. Un pago repetido no despacha dos motos, y un aviso viejo no «desentrega» un pedido. |
| Moneda | **Soles (PEN), montos en céntimos enteros** | Yape es peruano; enteros evitan errores de redondeo al sumar. |
| Proveedores | **Simuladores locales** en `services/providers` (Go, sin dependencias) con formatos distintos entre sí | La regla del proyecto es no usar servicios pagos ni credenciales reales. Los simuladores reproducen lo difícil de verdad: formatos ajenos, firmas, reintentos, vencimiento del cobro y avance del delivery. |
| QR | **qrcode-generator** (MIT, sin dependencias) dibujado como SVG con React | Sin HTML inyectado. Funciona con cualquier lector de QR del celular. |
| Búsqueda | El navegador parte el pedido hablado («un kilo de azúcar, arroz») en términos y busca cada uno | La gente escribe así su lista. Es simple y se puede probar. |
| Salud | Se muestra como «Próximamente» | Primero un flujo completo que funcione de punta a punta. Sumar Salud es otro traductor y otra pantalla. |


## Registro con el teléfono verificado, perfil y contactos

Pedido explícito: un registro que primero pida el número y envíe un código por SMS con **OneSignal**;
luego nombre y usuario opcional (cambiable en Ajustes); después correo para recuperar la cuenta, foto
de perfil y traer los contactos del teléfono.

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Quién genera el código | **Parla** (6 cifras con azar criptográfico); se guarda solo su **HMAC**; OneSignal solo lo entrega | Se puede cambiar de proveedor de envío sin tocar la seguridad, y una copia de la base no revela códigos. |
| OneSignal | Adaptador detrás del puerto `VerificationSender` con la API de mensajes (`POST /notifications?c=sms` y `?c=email`, `Authorization: Key …`) | Es el proveedor pedido. El puerto permite cambiarlo (Twilio Verify, AWS SNS) cambiando una línea. |
| Sin credenciales | **Modo de prueba** solo en desarrollo: el código vuelve en la respuesta y sale en consola. En producción el core **no arranca** sin OneSignal | Se puede probar sin pagar SMS, y el modo de prueba no puede llegar a producción por descuido. |
| Límites | 10 min de vigencia, 5 intentos, 1 envío por minuto y 5 por hora por número, y límite por IP | Frena la fuerza bruta y el «SMS pumping» (cada SMS cuesta dinero). |
| Paso entre verificación y registro | **Comprobante de un solo uso** (30 min) en vez de volver a mandar el teléfono | El número que queda en la cuenta es justo el que se verificó, y el comprobante no sirve dos veces. |
| Contraseña | **Se mantiene** en el paso de datos | Cifra la copia de la clave privada (cifrado E2E) y permite entrar desde otro dispositivo. Sin contraseña habría que confiarle las claves al servidor. |
| Usuario | **Opcional**; se cambia en Ajustes (vacío lo quita) | Como se pidió: el teléfono basta para encontrar a alguien. |
| Correo | Opcional y **verificado con código** antes de contar | Un correo sin verificar podría dejar a alguien sin poder recuperar su cuenta, o servir para tomar la de otro. |
| Restablecer contraseña | Código al correo → contraseña y **claves nuevas** → los demás deciden **volver a compartir** cada chat (aviso en el chat) | Con cifrado de extremo a extremo, la clave anterior no se puede recuperar sin la contraseña. Compartir de nuevo solo con aceptación evita que quien robe un correo lea el historial sin que nadie se entere. |
| Clave de quien envolvió | Se guarda **la clave pública de quien envolvió** junto a cada copia de la clave del chat | Si alguien cambia sus claves, las copias que envolvió antes se siguen pudiendo abrir. Este problema lo descubrió la prueba E2E de recuperación. |
| Foto de perfil | El navegador recorta a 512×512 y re-codifica a **JPEG** (sin EXIF/GPS); el core valida que de verdad sea JPEG y ≤ 300 KB; URL impredecible y caché inmutable | Privacidad (sin ubicación), seguridad (ni SVG ni HTML disfrazado) y rendimiento. |
| Contactos | **Contact Picker API** (Chrome en Android; la persona elige y puede elegir todos) o escribir los números; se envían, se cruzan con las cuentas y **no se guardan** | Es lo que permite la web. Los números sin indicativo se completan con el del propio teléfono. |
| Lectura automática del SMS | **WebOTP** (`@dominio #código` al final del SMS) y `autocomplete="one-time-code"` | En Android el código se completa solo, y en iPhone aparece sobre el teclado. |
