#!/bin/bash
# Arranca los cuatro programas de Parla en un mismo contenedor. Si cualquiera se cae, el contenedor
# termina y la plataforma lo reinicia (mejor que dejar la app a medias).
set -u

PUBLIC_PORT="${PORT:-4100}"   # la plataforma (Render, Railway…) define $PORT; por defecto 4100
LOCAL=127.0.0.1               # los programas se hablan por IPv4 local (Elixir escucha solo en IPv4)
CORE_PORT=4101
REALTIME_PORT_LOCAL=4102
PROVIDERS_PORT_LOCAL=4103

for var in DATABASE_URL DIRECT_URL JWT_SECRET INTERNAL_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "✖ Falta la variable $var (agrégala en las variables de entorno de tu plataforma)" >&2
    exit 1
  fi
done

pids=()
stop() {
  echo "▸ Apagando…"
  kill "${pids[@]}" 2>/dev/null
  wait 2>/dev/null
}
trap stop TERM INT

# 1) Base de datos: migraciones pendientes (nunca borran datos) y administrador inicial si falta.
cd /app/apps/api || exit 1
echo "▸ Aplicando migraciones en la base de datos…"
npx prisma migrate deploy --schema prisma/schema.prisma || { echo "✖ Falló la migración: revisa DATABASE_URL y DIRECT_URL" >&2; exit 1; }
npx tsx prisma/seed/bootstrap.ts || echo "⚠ No se pudo crear el administrador inicial (se puede repetir más tarde)"

# 2) Core (también sirve la web compilada; WEB_DIST= vacío la apaga si la web va en otro sitio, p. ej. Vercel)
echo "▸ Core (NestJS) en :$CORE_PORT"
PORT=$CORE_PORT WEB_DIST="${WEB_DIST-../web/dist}" \
  REALTIME_URL="http://$LOCAL:$REALTIME_PORT_LOCAL" \
  CORE_INTERNAL_URL="http://$LOCAL:$CORE_PORT" \
  node dist/main.js &
pids+=($!)

# 3) Tiempo real (Elixir)
echo "▸ Tiempo real (Elixir) en :$REALTIME_PORT_LOCAL"
REALTIME_PORT=$REALTIME_PORT_LOCAL CORE_URL="http://$LOCAL:$CORE_PORT" \
  /opt/realtime/bin/parla_realtime start &
pids+=($!)

# 4) Simuladores (billetera, delivery y tienda de prueba)
echo "▸ Simuladores en :$PROVIDERS_PORT_LOCAL"
PROVIDERS_PORT=$PROVIDERS_PORT_LOCAL \
  PROVIDERS_PUBLIC_URL="${PROVIDERS_PUBLIC_URL:-http://$LOCAL:$PROVIDERS_PORT_LOCAL}" \
  /usr/local/bin/providers &
pids+=($!)

# 5) Gateway: la única puerta pública
echo "▸ Gateway (Go) en :$PUBLIC_PORT"
APP_ENV=production GATEWAY_PORT=$PUBLIC_PORT \
  CORE_URL="http://$LOCAL:$CORE_PORT" \
  REALTIME_LINK_URL="ws://$LOCAL:$REALTIME_PORT_LOCAL/link" \
  PROVIDERS_URL="http://$LOCAL:$PROVIDERS_PORT_LOCAL" \
  GATEWAY_PUBLIC_URL="http://$LOCAL:$PUBLIC_PORT" \
  /usr/local/bin/gateway &
pids+=($!)

# Si uno termina, se termina todo (y la plataforma reinicia el contenedor).
wait -n
code=$?
echo "✖ Un programa se detuvo (código $code); reiniciando el contenedor" >&2
stop
exit "$code"
