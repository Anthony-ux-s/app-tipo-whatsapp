# Cómo desplegar Parla

## ¿Se puede en Vercel?

**Solo una parte.** Vercel es excelente para sitios estáticos y funciones cortas, pero Parla no es solo una
web: son **cuatro procesos que deben estar siempre encendidos**.

| Pieza | Qué es | ¿Cabe en Vercel? |
| --- | --- | --- |
| Web (PWA) | Archivos estáticos compilados con Vite | Sí, pero ver la nota de abajo |
| **Gateway** (Go) | Puerta única: API, tiempo real, avisos de pago | No: es un servidor permanente |
| **Core** (NestJS) | API, base de datos, notificaciones push | No: servidor permanente con archivos en disco |
| **Tiempo real** (Elixir) | Chats y llamadas por WebSocket | No: Vercel no mantiene conexiones WebSocket |
| Base de datos | PostgreSQL | Ya está en **Supabase** ✔ |

> La web pide `/api` y `/ws` en el **mismo dominio**. Si la pones en Vercel y el resto en otro lado,
> el WebSocket no pasa por los *rewrites* de Vercel y los chats se rompen. Por eso **no recomiendo partirla**:
> lo más simple y barato es poner todo junto en un servidor.

## Lo recomendado: un servidor con Docker (VPS)

Todo ya viene preparado: `docker compose up -d --build` levanta el gateway, el core, el tiempo real y
**Caddy**, que publica el sitio con **HTTPS automático** (certificado gratis de Let's Encrypt, renovado solo).

**Qué necesitas:**

| Qué | Detalle |
| --- | --- |
| Servidor Linux | Ubuntu 22.04/24.04, **mínimo 2 GB de RAM** (4 GB más cómodo), 2 vCPU, 20 GB de disco. Proveedores: Hetzner, DigitalOcean, Contabo, Vultr (≈ US$5–12 al mes). |
| Dominio | `kronito.com` con un registro **A** que apunte a la IP del servidor. |
| Puertos abiertos | 22 (SSH), **80 y 443**. Nada más. |
| Software | Docker y Docker Compose (`curl -fsSL https://get.docker.com \| sh`). |
| `.env` | El de tu proyecto (copia el archivo al servidor; **no está en git**). |
| Base de datos | Supabase (ya configurada: `DATABASE_URL` y `DIRECT_URL`). |

**Pasos:**

```bash
# 1. En el servidor
git clone https://github.com/Anthony-ux-s/app-tipo-whatsapp.git parla && cd parla

# 2. Copia tu .env desde tu PC (desde tu PC, no desde el servidor):
#    scp .env usuario@IP_DEL_SERVIDOR:~/parla/.env

# 3. Levanta todo (la primera vez tarda unos minutos en compilar)
docker compose up -d --build

# 4. Revisa que esté sano
docker compose ps
curl -s https://kronito.com/api/health
```

Al arrancar, el core **aplica solo las migraciones** en Supabase y crea el administrador si falta.

**Actualizar la app** cuando cambies el código:

```bash
cd parla && git pull && docker compose up -d --build
```

## Alternativa: Railway, Render o Fly.io

Sirven si no quieres administrar un servidor. Cada carpeta con `Dockerfile` es un servicio
(`/` = core, `services/gateway`, `services/realtime`, `services/providers`); hay que crear cada uno,
darles red privada entre ellos y pasarles las variables a mano. Es más trabajo de configuración y
suele costar más que un VPS, pero se actualizan con un `git push`. Si eliges esto, dime cuál y te
preparo los archivos de cada plataforma.

## Lista de lo que debe estar listo antes de abrir al público

- [ ] DNS de `kronito.com` apuntando al servidor y HTTPS funcionando (Caddy lo hace solo).
- [ ] `.env` completo: Supabase, secretos, `ONESIGNAL_*` (y emisor de SMS configurado en OneSignal), `VAPID_*`.
- [ ] Cuenta de administrador creada y contraseña cambiada.
- [ ] **Pagos reales**: la billetera actual es un simulador. Falta integrar Mercado Pago (o Culqi): el aviso
      de pago (*webhook*) llegará a `https://kronito.com/hooks/…` (mismo dominio, sin subdominios).
- [ ] **Tiendas reales**: ver [TIENDAS.md](TIENDAS.md). El catálogo del «Mercado» hoy es un simulador.
- [ ] Servidor de rutas propio para el delivery (el `router.project-osrm.org` de la configuración es solo de demostración).
- [ ] **Copias de seguridad**: la base la respalda Supabase; los **archivos subidos** (fotos, documentos, ya
      cifrados) están en el volumen `app-storage` del servidor → respáldalo (p. ej. a diario con `rclone` o
      `restic` a un almacenamiento externo).
- [ ] Cortafuegos del servidor: `ufw allow 22,80,443/tcp && ufw enable`.
- [ ] Cambiar la contraseña de la base de datos de Supabase (se compartió en un chat) y actualizar `DATABASE_URL`/`DIRECT_URL`.

## Costos aproximados (por mes, pueden cambiar)

| Servicio | Costo |
| --- | --- |
| Servidor (VPS) | US$5–12 |
| Supabase | gratis para empezar; ≈ US$25 el plan Pro (recomendado en producción por las copias diarias) |
| Dominio | ≈ US$12–20 al año |
| OneSignal | según el plan; los **SMS se pagan por mensaje** (Twilio) |
| Mercado Pago / Culqi | comisión por cada venta (sin cuota fija) |
| Google Play (solo si publicas el APK) | US$25 una sola vez |

## Si algo falla

```bash
docker compose logs -f core        # errores de la API y de la base de datos
docker compose logs -f gateway     # errores de pedidos y pagos
docker compose logs -f caddy       # certificado / HTTPS
```

Causas típicas: el DNS aún no apunta al servidor (Caddy no consigue el certificado), una variable
obligatoria vacía (el core avisa cuál), o `DATABASE_URL` mal escrita (si la contraseña tiene `#`, `@` o `/`
debe ir codificada: `%23`, `%40`, `%2F`).
