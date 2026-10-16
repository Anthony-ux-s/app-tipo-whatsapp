# Parla — mensajería para equipos

Chat tipo WhatsApp para equipos de trabajo: espacios de trabajo separados de la vida personal,
chats individuales y grupales en tiempo real, fotos, videos y notas de voz, todo **cifrado de
extremo a extremo**. Incluye las Fases 1, 2 y 3 del plan de `INVESTIGACION.md` (mensajería, multimedia, espacios de
trabajo, **tareas en el chat, hilos, menciones y notificaciones push**), instalable en el celular como PWA.

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

Para instalarla en el celular, abre la web desde el navegador del teléfono (en la misma red) y
elige «Agregar a la pantalla de inicio».

Otros comandos:

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Igual que `start` pero con la API en modo *watch* (sin reinstalar ni recargar datos). |
| `npm test` | Pruebas unitarias: cifrado, casos de uso de la API y utilidades de la web. |
| `npm run test:e2e` | Recorrido de punta a punta con Playwright (levanta los servidores si no están corriendo). La primera vez: `npx playwright install chromium`. |
| `npm run db:reset` | Borra la base de desarrollo y los archivos, y vuelve a cargar los datos de ejemplo. |
| `npm run typecheck` / `npm run build` | Verificación de tipos y compilación de producción. |

## Usuarios de prueba

Contraseña para todos: **`Parla2026!`**

| Entrar con | Persona | Tipo de usuario |
| --- | --- | --- |
| `laura` | Laura Méndez | **Administradora** de *Café Andino* · colaboradora en *Proyecto Faro* |
| `camila` | Camila Torres | **Administradora** de *Proyecto Faro* · colaboradora en *Café Andino* |
| `andres` | Andrés Rojas | **Colaborador** de *Café Andino* |
| `+57 300 123 4567` | Sofía Ramírez | **Colaboradora**, entra con su **teléfono** |
| `diego`, `mateo`, `valentina` | Resto del equipo | Colaboradores |

Enlaces de invitación de ejemplo: `/invitacion/andino2026` y `/invitacion/faro2026xy`.
La pantalla de inicio de sesión tiene accesos directos a las cuentas de prueba.

## Qué tiene esta versión

**Autenticación y perfil**
- Registro con **teléfono o nombre de usuario** y contraseña; inicio de sesión con cualquiera de los dos.
- Consentimiento de tratamiento de datos (Ley 1581 / LGPD) en el registro.
- Perfil (nombre, info., color de avatar), preferencias (tema claro/oscuro/sistema, enviar con Enter, sonido).

**Chat individual y grupal**
- Mensajes en **tiempo real** (Socket.IO), con estados **enviado ✓ → entregado ✓✓ → leído ✓✓ (cian)**;
  en grupos manda el destinatario más atrasado.
- Fotos y videos con comentario, **notas de voz** grabadas en el navegador, visor de imágenes.
- «Escribiendo…», presencia (en línea / última vez), contador de no leídos, búsqueda y filtros
  (no leídos, grupos, personas), historial ilimitado con carga de mensajes anteriores.
- Grupos: crear, agregar personas (quien lo creó o un administrador), salir; avisos de sistema.
- Envío optimista con reintento si falla; al reconectar se recupera lo pendiente.

**Cifrado y seguridad**
- **E2E con WebCrypto**: ECDH P-256 + HKDF + AES-GCM 256. Cada conversación tiene su clave,
  envuelta para cada miembro; el servidor solo guarda texto y archivos cifrados (la prueba E2E lo comprueba).
- Huella de seguridad para verificar contactos. JWT, bcrypt, límites de intentos de inicio de sesión,
  validación en cada entrada y regla 404-no-403 para no revelar chats ni espacios ajenos.

**Colaboración (Fase 3)**
- **Tareas asignables dentro del chat**: se crean desde el panel de tareas o convirtiendo cualquier mensaje
  (menú del mensaje → «Convertir en tarea»), con responsable y fecha límite. Aparecen como tarjeta en el
  chat, se completan con una casilla y se actualizan en vivo para todos. Las completan quien la creó, la
  persona asignada o un administrador. El título va **cifrado de extremo a extremo** como los mensajes.
- **Mis tareas**: vista del espacio con *Asignadas a mí*, *Creadas por mí* y *Hechas*, con fechas
  vencidas resaltadas; abre el chat de origen con su panel de tareas.
- **Hilos de respuesta**: «Responder en hilo» abre un panel lateral con el mensaje raíz y sus respuestas;
  el mensaje muestra «N respuestas» en vivo. «Responder» cita el mensaje en el chat principal.
  Los hilos no se anidan (responder a una respuesta cuelga de la misma raíz).
- **Menciones con @**: al escribir @ aparece la lista de participantes (con teclado: ↑ ↓ Enter); la
  mención se resalta y, si es para ti, el mensaje se marca y el chat muestra un aviso **@** hasta leerlo.
- **Notificaciones**: con la app abierta en segundo plano, aviso del sistema con el texto ya descifrado
  en el navegador. Con la app cerrada, **Web Push** (VAPID, sin servicios de pago) a quien no está
  conectado; por privacidad estos avisos no llevan el contenido («Laura te mencionó», «Nueva tarea»).
  Se activan por dispositivo en *Ajustes → Notificaciones*. Las claves VAPID se generan solas la primera
  vez (`apps/api/storage/vapid.json`) o se definen en `.env`.

**Espacios de trabajo y roles**
- **Administrador**: crea el espacio, invita por enlace (copiar, compartir, renovar), cambia roles,
  quita miembros, edita nombre/descripción y decide si los colaboradores pueden crear grupos.
  El espacio nunca se queda sin administradores.
- **Colaborador**: se une con el enlace, ve el directorio del equipo y conversa.

**Interfaz multiplataforma**
- Sidebar con perfil y espacio, nuevo chat/grupo, lista con no leídos y ajustes; barra de espacios
  al estilo de las apps de equipos. En el celular, la lista es la pantalla principal, el chat se abre
  a pantalla completa con botón de volver y hay navegación inferior.
- PWA instalable (manifest + service worker), tema oscuro, estados vacíos ilustrados, esqueletos de
  carga, estados de error con reintento, aviso de conexión y transiciones de 200 ms.
- Logo propio y todas las ilustraciones en SVG.

## Cómo está hecho

Monorepo con npm workspaces:

```
apps/
  api/   NestJS + Prisma — Screaming Architecture + Ports & Adapters
         src/modules/{admin,members,platform}  ·  src/infra/{prisma,identity,storage,realtime}
  web/   React + Vite + Tailwind — módulos con components/ hooks/ const/ types/ utils/
         src/modules/{auth,chats,workspaces,settings,shell}  ·  src/shared/{ui,utils,stores,...}
packages/
  types/   @parla/types — contratos y enums compartidos (fuente única)
  crypto/  @parla/crypto — cifrado de extremo a extremo (mismo código en navegador y en el seed)
```

Las decisiones de tecnología, una por una y con su porqué, están en **[DECISIONES.md](DECISIONES.md)**.
En resumen: TypeScript, React 19 + Vite + Tailwind 4, NestJS 11 + Prisma 6, SQLite embebida en
desarrollo (PostgreSQL en producción), auth propia con JWT, Socket.IO para tiempo real, WebCrypto para
el cifrado y PWA en lugar de app nativa. Todo gratis y de código abierto.

### Producción

1. `npm run db:postgres-schema -w @parla/api` genera `schema.postgres.prisma`; con `DATABASE_URL`
   de PostgreSQL (Supabase, Neon…) ejecuta `npx prisma db push --schema prisma/schema.postgres.prisma`.
2. API en un servicio Node persistente (Render, Fly, Railway) con `JWT_SECRET`, `WEB_ORIGIN` y `DATABASE_URL`.
3. Web estática (`apps/web/dist`) en Vercel o Netlify, con un *rewrite* de `/api` y `/socket.io` a la API.

## Pruebas

- **Unitarias (Vitest, 77)**: cifrado E2E (7); reglas de dominio y casos de uso de la API con
  adaptadores en memoria (47) — estados de entrega, permisos, inicio de sesión, idempotencia, hilos,
  menciones, tareas (crear, asignar, completar, permisos, fechas) y a quién llega cada push —;
  utilidades de la web (23) — menciones, fechas límite, vistas de tareas, avisos locales.
- **Punta a punta (Playwright, navegador real y peticiones reales)**: dos personas conversando en
  tiempo real con recibo de leído y verificación de que la API nunca devuelve texto en claro;
  descifrado de fotos y notas de voz; error de contraseña; entrada por teléfono; registro desde un
  enlace de invitación, unión al espacio, chat con la administradora y cambio de rol; y la
  navegación en el celular. Fase 3: mención con el selector @ y aviso al mencionado, respuesta en
  hilo con contador en vivo, respuesta citada, mensaje convertido en tarea asignada que la otra
  persona completa desde «Mis tareas» (y la autora lo ve al instante), permisos de las tareas y
  alta/baja de suscripciones push contra la API real.

## Qué falta (siguientes fases)

Según el plan de `INVESTIGACION.md`:

- **Fase 3 (pendiente)**: búsqueda dentro del historial (con cifrado E2E debe hacerse en el
  dispositivo), comentarios y subtareas en las tareas, recordatorios push antes de la fecha límite,
  silenciar chats, y probar el push de punta a punta en celulares reales (Android/iOS instalada).
- **Fase 4**: planes de suscripción con MercadoPago/Stripe detrás de un puerto `PaymentGateway`,
  términos y política de privacidad completos, despliegue a producción.
- **Seguridad**: verificación del teléfono por SMS/OTP, rotación de la clave del grupo cuando alguien
  sale, guardar la clave privada como no extraíble en IndexedDB, mensajes autodestructivos,
  recuperación de cuenta si se olvida la contraseña (hoy implicaría perder el historial cifrado).
- **Escala**: presencia y Socket.IO con Redis para varias instancias, archivos en S3/R2, colas.
