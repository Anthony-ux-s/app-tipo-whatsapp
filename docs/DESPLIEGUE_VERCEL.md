# Despliegue: web en Vercel + backend en un servidor

Vercel no puede ejecutar el **tiempo real (Elixir)** ni mantener WebSockets, así que Parla se reparte en dos:

| Dónde | Qué | Dirección |
| --- | --- | --- |
| **Vercel** | La web (PWA) | `kronito.com` |
| **Un servidor (VPS) con Docker** | Gateway (Go) + Core (NestJS) + **Tiempo real (Elixir)** + simuladores + Caddy (HTTPS) | `api.kronito.com` |
| **Supabase** | Base de datos | ya configurada |

La web llama a `/api/...` en su propio dominio y **Vercel lo reenvía** al servidor (`vercel.json`, así las fotos
y los enlaces relativos siguen funcionando). Los **WebSockets** (chats y llamadas) no pasan por Vercel: la web
se conecta directo a `wss://api.kronito.com/ws` (variable `VITE_WS_URL`).

## 1. La web en Vercel (ya hecho)

El proyecto **parla** ya está desplegado en la cuenta de Vercel: https://parla-xi.vercel.app

- `vercel.json` (raíz) define la compilación y los reenvíos hacia `api.kronito.com`.
- Variable en Vercel: `VITE_WS_URL=wss://api.kronito.com` (Production).
- Cada `git push` a `main` vuelve a desplegar si conectas el repositorio en
  *Vercel → Project → Settings → Git*. También se puede desplegar a mano: `vercel deploy --prod`.

## 2. El backend en un servidor

**Qué necesitas:** un servidor Linux (Ubuntu 22.04/24.04, **2 GB de RAM**, ≈ US$5–6/mes en Hetzner, DigitalOcean,
Contabo…) con puertos **22, 80 y 443** abiertos.

```bash
# En el servidor
curl -fsSL https://get.docker.com | sh
git clone https://github.com/Anthony-ux-s/app-tipo-whatsapp.git parla && cd parla
```

Copia tu `.env` al servidor (desde tu PC; **nunca** va a git):

```bash
scp .env usuario@IP_DEL_SERVIDOR:~/parla/.env
```

Antes de levantarlo, estos valores del `.env` deben quedar así:

```
SITE_ADDRESS=api.kronito.com
WEB_ORIGIN=https://kronito.com,https://parla-xi.vercel.app
PUBLIC_URL=https://kronito.com
```

```bash
docker compose up -d --build        # la primera vez tarda unos minutos
curl -s https://api.kronito.com/api/health
```

Al arrancar, el core **aplica solo las migraciones** en Supabase y crea el administrador si falta.
Para actualizar: `git pull && docker compose up -d --build`.

## 3. DNS (en el sitio donde compraste `kronito.com`)

| Registro | Nombre | Valor |
| --- | --- | --- |
| A | `api` | IP del servidor |
| A | `@` (kronito.com) | `76.76.21.21` (Vercel) |
| CNAME | `www` | `cname.vercel-dns.com` |

Luego, en Vercel: *Project → Settings → Domains → Add* `kronito.com`. (Mientras el dominio no esté a tu nombre
en Vercel, la web funciona en `parla-xi.vercel.app`.)

## 4. Revisar

- `https://api.kronito.com/api/health` → `{"status":"ok"}`
- Abrir la web, iniciar sesión, mandar un mensaje (prueba el tiempo real).
- Mercado Pago: el aviso de pago llega a `https://api.kronito.com/hooks/…`.
