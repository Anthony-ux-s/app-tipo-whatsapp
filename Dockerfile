# Core de Parla (NestJS): API REST y la web (PWA) compilada. Va detrás del gateway (services/gateway),
# que es la única puerta pública. Base de datos: PostgreSQL (ver docker-compose.yml). Puerto interno: 4101.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY packages/crypto/package.json packages/crypto/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
# Esquema PostgreSQL a partir del de desarrollo, cliente Prisma para Postgres y compilación.
RUN npm run build:packages \
  && node apps/api/prisma/make-postgres-schema.mjs \
  && npx prisma generate --schema apps/api/prisma/schema.postgres.prisma \
  && npm run build -w @parla/api \
  && npm run build -w @parla/web

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 parla && mkdir -p /data/storage && chown -R parla /data
COPY --from=build --chown=parla /app /app
USER parla

ENV NODE_ENV=production \
    PORT=4101 \
    WEB_DIST=../web/dist \
    STORAGE_DIR=/data/storage
EXPOSE 4101
WORKDIR /app/apps/api
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4101/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Sincroniza el esquema (sin borrar datos) y arranca.
CMD ["sh", "-c", "npx prisma db push --schema prisma/schema.postgres.prisma --skip-generate && node dist/main.js"]
