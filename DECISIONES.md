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
| Tiempo real | **Socket.IO** (gateway de Nest) detrás del puerto `RealtimePublisher` | Entrega instantánea, confirmaciones de entregado/leído, “escribiendo…” y presencia. Es lo que proponía el Stack 1 y no depende de un proveedor. |
| Cifrado de extremo a extremo | **WebCrypto** (ECDH P-256 + HKDF + AES-GCM 256), paquete `@parla/crypto` | Nativo del navegador y de Node, sin dependencias. El servidor solo guarda texto y archivos cifrados. Ver detalle abajo. |
| Archivos (fotos, audio, vídeo) | **Disco local** (`apps/api/storage/`) detrás del puerto `FileStorage` | Gratis en desarrollo; en producción se cambia por S3/R2/Supabase Storage con un adaptador. Los archivos se suben ya cifrados. |
| Notas de voz | **MediaRecorder** del navegador | Sin librerías; graba `audio/webm` y se cifra antes de subir. |
| Mapas | No aplica | El rubro (mensajería) no lo necesita en esta versión. |
| PWA | **vite-plugin-pwa** | Instalable en el celular (manifest + service worker), sin app nativa: la investigación no exige una. |
| Pruebas | **Vitest** (lógica) + **Playwright** (recorrido de punta a punta) | Libres, rápidos, y Playwright prueba con un navegador real y peticiones reales. |
| Alojamiento | **Web en Vercel o Netlify (estático)**, **API en Render/Fly/Railway (Node)**, **Postgres en Supabase/Neon** | Todos tienen capa gratuita. La API necesita un proceso Node persistente por los WebSockets. |

## Puertos usados en esta versión

`3100` para la web (Vite) y `4100` para la API. Los puertos 3000, 3005 y 4317 están ocupados en esta
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
- **Roles**: dos roles por espacio de trabajo, `admin` y `member` (colaborador). El administrador
  crea el espacio, invita por enlace, cambia roles y crea canales; el colaborador se une con el
  enlace y conversa. Ambos chatean como iguales, por eso el motor de mensajería vive en
  `modules/platform/messaging` y cada rol pone su propia puerta.
- **Estados de un mensaje**: `sent` → `delivered` → `read`. En grupos el estado visible es el
  mínimo entre todos los destinatarios (se guarda un recibo por destinatario).
- **Historial**: sin límite de días (la crítica a Slack); se pagina por cursor de 40 en 40.
