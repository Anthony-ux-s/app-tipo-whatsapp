# Parla — mensajería para equipos

Chat tipo WhatsApp para equipos de trabajo: espacios de trabajo separados de la vida personal,
chats individuales y grupales en tiempo real, fotos, videos, notas de voz y **llamadas de voz y
video**, todo **cifrado de extremo a extremo**. Incluye las cuatro fases del plan de
`INVESTIGACION.md`: mensajería, multimedia, espacios de trabajo con tareas, hilos, menciones y
notificaciones push, y **planes de pago, aspectos legales y despliegue a producción**. Se instala en
el celular como PWA.

![Logo](apps/web/public/icons/icon-192.png)

## Arrancar

Requisitos: **Node.js 20.19 o superior** (probado con Node 24). No hace falta instalar ninguna base
de datos ni servicio aparte.

```bash
npm start
```

Ese único comando instala las dependencias (la primera vez), crea `apps/api/.env`, prepara la
base de datos SQLite embebida, carga los datos de ejemplo, compila y levanta:

| Servicio | URL |
| --- | --- |
| Web (PWA) | http://localhost:3100 |
| API | http://localhost:4100/api (salud: `/api/health`) |

Para instalarla en el celular, abre la web desde el navegador del teléfono y elige «Agregar a la
pantalla de inicio». La cámara, el micrófono y las notificaciones push exigen HTTPS fuera de
`localhost` (ver [Despliegue](#despliegue-a-producción)).

Otros comandos:

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Igual que `start` pero con la API en modo *watch* (sin reinstalar ni recargar datos). |
| `npm run start:prod` | **Producción en un solo proceso**: compila y la API sirve también la web en http://localhost:4100. |
| `npm test` | Pruebas unitarias: cifrado, casos de uso de la API y utilidades de la web. |
| `npm run test:e2e` | Recorrido de punta a punta con Playwright. La primera vez: `npx playwright install chromium`. |
| `npm run db:reset` | Borra la base de desarrollo y los archivos, y vuelve a cargar los datos de ejemplo. |
| `npm run typecheck` / `npm run build` | Verificación de tipos y compilación de producción. |

## Usuarios de prueba

Contraseña para todos: **`Parla2026!`**

| Entrar con | Persona | Tipo de usuario |
| --- | --- | --- |
| `laura` | Laura Méndez | **Administradora** de *Café Andino* (plan Equipo, con historial de pagos) · colaboradora en *Proyecto Faro* |
| `camila` | Camila Torres | **Administradora** de *Proyecto Faro* (plan Gratis) · colaboradora en *Café Andino* |
| `andres` | Andrés Rojas | **Colaborador** de *Café Andino* |
| `+57 300 123 4567` | Sofía Ramírez | **Colaboradora**, entra con su **teléfono** |
| `diego`, `mateo`, `valentina` | Resto del equipo | Colaboradores |

Enlaces de invitación de ejemplo: `/invitacion/andino2026` y `/invitacion/faro2026xy`.
Para probar una llamada, entra con `laura` en una ventana y con `andres` en otra (o en una ventana
privada) y pulsa el botón de video o de teléfono en su chat.

## Qué tiene esta versión

**Autenticación y perfil**
- Registro con **teléfono o nombre de usuario** y contraseña; inicio de sesión con cualquiera de los dos.
- Aceptación de términos y política de privacidad (Ley 1581 / LGPD) con versión y fecha registradas.
- Perfil (nombre, info., color de avatar), preferencias (tema claro/oscuro/sistema, enviar con Enter, sonido).

**Chat individual y grupal**
- Mensajes en **tiempo real** (Socket.IO), con estados **enviado ✓ → entregado ✓✓ → leído ✓✓ (cian)**;
  en grupos manda el destinatario más atrasado.
- Fotos y videos con comentario, **notas de voz** grabadas en el navegador, visor de imágenes.
- «Escribiendo…», presencia, no leídos, búsqueda y filtros, historial ilimitado.
- Grupos: crear, agregar personas, salir; avisos de sistema. Envío optimista con reintento.

**Llamadas de voz y video**
- Botones de **videollamada** y **llamada de voz** en la cabecera de cada chat (individual o grupal).
- Llamada entrante con timbre, contestar o rechazar; pantalla de llamada con video de cada persona,
  vista propia, temporizador, **silenciar**, **apagar la cámara** y colgar.
- **WebRTC P2P cifrado (DTLS-SRTP)**: el audio y el video van directo entre los participantes; el
  servidor solo coordina la llamada. Grupos en malla: hasta 4 personas en el plan Gratis y 8 en los de pago.
- Al terminar queda el registro en el chat («🎥 Videollamada · 3:05», «📞 Llamada de voz perdida»).
  Si nadie contesta en 45 s se da por perdida. A quien está desconectado le llega un push.

**Colaboración**
- **Tareas asignables** desde el panel de tareas o convirtiendo un mensaje, con responsable y fecha;
  tarjeta en el chat que se completa con una casilla; vista **Mis tareas**.
- **Hilos de respuesta** en panel lateral, respuestas citadas, **menciones con @**.
- **Notificaciones**: avisos del sistema con la app en segundo plano y **Web Push** con la app cerrada
  (sin contenido, por el cifrado E2E). Se activan en *Ajustes → Notificaciones*.

**Planes y pagos (Fase 4)**
- Planes **Gratis** (hasta 10 miembros), **Equipo** ($49.900 COP/mes, hasta 50) y **Empresa**
  ($149.900 COP/mes, ilimitados), por espacio de trabajo. El límite de miembros se aplica al unirse
  con un enlace de invitación.
- Página **Plan** del espacio (desde *Equipo → Plan*): plan vigente, vencimiento, catálogo, pago y
  **historial de pagos**. Solo los administradores pagan; los colaboradores ven el plan.
- **Sin cobros automáticos**: cada pago cubre un mes; pagar el mismo plan antes de vencer suma un mes
  al final. Al vencer, el espacio vuelve al plan Gratis sin perder nada.
- Pasarela detrás del puerto `PaymentGateway`:
  - **Sandbox** (por defecto): pantalla de pago simulado dentro de Parla; no cobra nada.
  - **MercadoPago Checkout Pro**: con `PAYMENT_PROVIDER=mercadopago` y `MERCADOPAGO_ACCESS_TOKEN`.
    El webhook verifica la firma (`MERCADOPAGO_WEBHOOK_SECRET`) y **consulta el pago real** en la API de
    MercadoPago antes de activar nada; si el importe no coincide, no se activa el plan.

**Legal y datos personales**
- Páginas públicas de **Términos y condiciones** (incluye política de cancelación y retracto) y
  **Política de privacidad** (Ley 1581/2012, Decreto 1377/2013, LGPD), enlazadas desde el registro.
- **Descargar mis datos** (JSON) y **eliminar la cuenta** con contraseña: la cuenta se anonimiza (sin
  nombre, usuario, teléfono ni claves), sale de sus espacios y no puede volver a entrar. No permite dejar
  un espacio sin administrador.
- Revisión de seguridad documentada en **[SECURITY.md](SECURITY.md)**.

**Espacios de trabajo, roles e interfaz**
- Administrador: invita por enlace, cambia roles, quita miembros, configura el espacio y paga el plan.
- Colaborador: se une con el enlace, conversa, llama y gestiona sus tareas.
- Sidebar, navegación inferior en el celular, PWA instalable, tema oscuro, estados vacíos, de carga y de
  error, transiciones suaves; logo e ilustraciones propios en SVG.

## Cómo está hecho

Monorepo con npm workspaces:

```
apps/
  api/   NestJS + Prisma — Screaming Architecture + Ports & Adapters
         src/modules/{admin,members,platform}
         src/infra/{prisma,identity,storage,realtime,push,payments}
  web/   React + Vite + Tailwind — módulos con components/ hooks/ const/ types/ utils/
         src/modules/{auth,chats,calls,tasks,billing,legal,workspaces,settings,shell}
packages/
  types/   @parla/types — contratos y enums compartidos (fuente única)
  crypto/  @parla/crypto — cifrado de extremo a extremo
```

Las decisiones de tecnología, una por una y con su porqué, están en **[DECISIONES.md](DECISIONES.md)**.

## Despliegue a producción

**Opción A — Docker + PostgreSQL** (servidor propio, VPS, Render, Fly, Railway):

```bash
cp .env.production.example .env.production   # completa PUBLIC_URL, POSTGRES_PASSWORD, JWT_SECRET…
docker compose --env-file .env.production up -d --build
```

La imagen compila el esquema PostgreSQL (`schema.postgres.prisma`), sincroniza la base al arrancar y
sirve web + API en el puerto 8080. Pon delante un proxy con HTTPS (Caddy, Nginx, Traefik o el del
proveedor). Para llamadas en redes corporativas muy cerradas, configura un servidor TURN (`TURN_URL`).

**Opción B — un solo proceso Node** (sin Docker): `npm run start:prod`. Usa la base de `DATABASE_URL`
(SQLite por defecto), genera un secreto de sesiones en `apps/api/.secrets/` si no defines `JWT_SECRET`,
y sirve todo en el puerto `PORT` (4100).

En producción la API: se niega a arrancar con el secreto de desarrollo o uno de menos de 32
caracteres; envía cabeceras de seguridad con helmet (CSP estricta, HSTS, `nosniff`,
`frame-ancestors 'none'`, `Permissions-Policy` de cámara y micrófono); confía en el proxy para la IP
real (límite de intentos) y sirve los assets con caché inmutable y el `index.html`/`sw.js` sin caché.

Variables completas en `apps/api/.env.example` y `.env.production.example`.

## Pruebas

- **Unitarias (Vitest, 108)**: cifrado E2E (7); API (75): estados de entrega, permisos, inicio de
  sesión, hilos, menciones, tareas, push, **planes y pagos** (vigencia, límite de miembros, renovación
  acumulada, pago aprobado/rechazado/repetido, importe que no coincide, webhook), **MercadoPago con red
  simulada** (preferencia, firma del webhook válida y falsificada), **llamadas** (timbre, contestar,
  reenvío de señalización solo entre participantes, colgar con duración, perdida a los 45 s, rechazo,
  grupo, ocupado, caída de conexión, push) y **datos personales** (términos, exportar, eliminar
  anonimizando, administrador único); web (26).
- **Punta a punta (Playwright, 17 recorridos, navegador real)**: chat cifrado en tiempo real, fotos y
  notas de voz, registro e invitación, celular, Fase 3 (menciones, hilos, tareas, push) y Fase 4:
  **videollamada real por WebRTC** entre dos navegadores con cámara y micrófono simulados (ambos ven
  el video del otro, silenciar, apagar cámara, colgar y registro en el chat), llamada rechazada,
  **mejora de plan con pago de prueba**, pago rechazado, colaborador sin permiso de pago, páginas
  legales, y descarga de datos + eliminación de cuenta.
  La suite completa pasa en modo desarrollo y en **modo producción de un solo proceso** (CSP activa).

## Qué falta

- **Probado en esta PC sin Docker**: el `Dockerfile` y el `docker-compose.yml` no se pudieron
  construir aquí; el esquema PostgreSQL sí se validó con Prisma y el modo producción se probó con SQLite.
- **MercadoPago real**: el adaptador está probado con la red simulada; falta probarlo con
  credenciales de prueba de una cuenta de MercadoPago y un webhook público.
- **Llamadas**: sin servidor TURN propio, algunas redes muy restrictivas no conectan; compartir
  pantalla, llamadas grupales grandes (SFU) y verificación de huellas DTLS fuera de banda.
- **Seguridad**: SMS/OTP para el teléfono, rotación de la clave del grupo cuando alguien sale, clave
  privada no extraíble en IndexedDB, recuperación de cuenta, auditoría externa.
- **Producto**: búsqueda en el historial (en el dispositivo), recordatorios de tareas, silenciar chats,
  facturación electrónica (DIAN) para los pagos, revisión legal de los textos por un abogado.
- **Escala**: Socket.IO y presencia con Redis para varias instancias, archivos en S3/R2, colas.
