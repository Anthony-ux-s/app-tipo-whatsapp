# Parla TODO EN UNO, para cualquier plataforma que construya un Dockerfile (Render, Railway, Fly, Koyeb, un VPS…).
# Un solo contenedor con todo, que se habla por 127.0.0.1:
#   gateway (Go)         → ÚNICA puerta pública: escucha en $PORT (la plataforma lo define; por defecto 4100)
#   core (NestJS)        → API, base de datos (Supabase) y la web (PWA) compilada, puerto interno 4101
#   tiempo real (Elixir) → chats y llamadas por WebSocket, puerto interno 4102
#   simuladores (Go)     → billetera, delivery y tienda de prueba, puerto interno 4103
# Variables obligatorias al ARRANCAR: DATABASE_URL, DIRECT_URL, JWT_SECRET, INTERNAL_TOKEN (el resto: .env.example).
# Variables de la web al CONSTRUIR (build args; Render y Railway las pasan solas si existen en el servicio):
#   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID, VITE_SIGNUP_METHOD.
# Salud: GET /gateway/health. Archivos subidos: /data/storage (monta un disco/volumen ahí para no perderlos).
# Con docker-compose en un VPS se usa Dockerfile.core + los Dockerfile de cada servicio.

# ── Gateway y simuladores (Go) ───────────────────────────────────────────────────────────────
FROM golang:1.25-bookworm AS go-build
WORKDIR /src
COPY services/gateway/go.mod services/gateway/go.sum gateway/
RUN cd gateway && go mod download
COPY services/gateway gateway
COPY services/providers providers
RUN cd gateway && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gateway ./cmd/gateway \
  && cd ../providers && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/providers ./cmd/providers

# ── Tiempo real (Elixir): release de OTP ─────────────────────────────────────────────────────
FROM elixir:1.18-otp-27-slim AS realtime-build
ENV MIX_ENV=prod
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
  && mix local.hex --force && mix local.rebar --force
COPY services/realtime/mix.exs services/realtime/mix.lock ./
COPY services/realtime/config config
RUN mix deps.get --only prod && mix deps.compile
COPY services/realtime/lib lib
RUN mix release

# ── Core (NestJS + Prisma) y web (PWA) ───────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS core-build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY packages/crypto/package.json packages/crypto/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages packages
COPY apps apps
# Datos PÚBLICOS de la web (Firebase). Vite los incrusta al compilar: si faltan, esa función queda apagada.
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_SIGNUP_METHOD=""
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_SIGNUP_METHOD=$VITE_SIGNUP_METHOD
RUN npm run build:packages \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @parla/api \
  && npm run build -w @parla/web

# ── Imagen final ─────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini openssl ca-certificates libstdc++6 libncurses6 locales curl util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen \
  && useradd --create-home --uid 10001 parla \
  && mkdir -p /data/storage && chown -R parla /data
ENV LANG=en_US.UTF-8 NODE_ENV=production STORAGE_DIR=/data/storage RELEASE_TMP=/tmp/realtime

COPY --from=go-build /out/gateway /usr/local/bin/gateway
COPY --from=go-build /out/providers /usr/local/bin/providers
COPY --from=realtime-build --chown=parla /src/_build/prod/rel/parla_realtime /opt/realtime
COPY --from=core-build --chown=parla /app /app
COPY docker/entrypoint.sh docker/run.sh /usr/local/bin/
# sed: por si el archivo llegó con saltos de línea de Windows (CRLF), que rompen los scripts en Linux.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/run.sh \
  && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run.sh

# Los archivos subidos (ya cifrados) viven en /data/storage: monta ahí un volumen/disco para no perderlos
# (sin la instrucción VOLUME, que algunas plataformas prohíben).
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD curl -fs "http://127.0.0.1:${PORT:-4100}/gateway/health" || exit 1
# Arranca como root solo para dar permiso al disco montado, y enseguida baja a un usuario sin privilegios.
ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]
