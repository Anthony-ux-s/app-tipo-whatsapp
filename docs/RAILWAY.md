# Backend en Railway (todo en un solo servicio)

La web está en Vercel. El backend completo (gateway, core, **tiempo real con Elixir** y simuladores) corre en
**un solo contenedor** descrito en `Dockerfile`: los programas se hablan por `127.0.0.1`, así que no hay
red interna que configurar. La base de datos es Supabase.

```
Vercel (web)  ──/api──►  Railway: gateway :$PORT ─┬─► core        :4101 ──► Supabase
              ──wss───►                           ├─► tiempo real :4102 (Elixir)
                                                  └─► simuladores :4103
```

## Pasos

1. **Cuenta**: entra a <https://railway.com> con GitHub.
2. **Proyecto**: *New Project → Deploy from GitHub repo →* `Anthony-ux-s/app-tipo-whatsapp`.
   Railway detecta `railway.json` y construye con `Dockerfile` (la primera vez tarda 8–12 minutos).
3. **Variables**: abre el servicio → *Variables → Raw Editor* y pega el contenido del archivo **`railway.env`**
   de tu PC (está en la raíz del proyecto, fuera de git; lo generé a partir de tu `.env`).
4. **Volumen** (para las fotos y archivos subidos): *Settings → Volumes → New Volume* y móntalo en **`/data`**.
5. **Dominio**: *Settings → Networking → Generate Domain* (te da algo como `parla-production.up.railway.app`) o
   *Custom Domain* → `api.kronito.com` (Railway te muestra el registro CNAME que debes crear en tu DNS).
6. **Revisa**: abre `https://TU-DOMINIO/gateway/health` → debe mostrar `"status":"ok"`.
7. **Conecta la web**: pásale el dominio del paso 5 a quien mantiene Vercel (`vercel.json` →
   `rewrites[0].destination` y la variable `VITE_WS_URL=wss://TU-DOMINIO`) y vuelve a desplegar la web.

Cada `git push` a `main` vuelve a construir y desplegar solo.

## Qué hace al arrancar (`docker/run.sh`)
1. Comprueba que existan `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` e `INTERNAL_TOKEN`.
2. Aplica las migraciones de Prisma en Supabase (nunca borra datos) y crea el administrador si falta.
3. Levanta core, tiempo real, simuladores y gateway. Si **uno se cae, el contenedor termina** y Railway lo reinicia.

## Si algo falla
Mira *Deployments → View Logs*. Causas típicas:
- `Falta la variable …` → no pegaste `railway.env` completo.
- `Falló la migración` → `DATABASE_URL`/`DIRECT_URL` mal escritas (la contraseña con `#` debe ir como `%23`).
- El healthcheck no pasa → espera hasta 3 minutos en el primer arranque; si sigue, revisa los registros del core.
- El chat no conecta → `VITE_WS_URL` en Vercel no coincide con el dominio de Railway, o falta ese dominio en `WEB_ORIGIN`.

## Costo
Railway cobra por uso: con un servicio de este tamaño suele ser **≈ US$5–10 al mes** (incluye crédito de prueba).
