#!/usr/bin/env node
// Producción en esta máquina: compila todo y arranca los tres servicios. El gateway (Go) es la
// única puerta pública: sirve la web (PWA, a través del core), la API en /api y el tiempo real en /ws.
//   npm run start:prod            → http://localhost:4100
//   PORT=8080 npm run start:prod
// Para PostgreSQL usa Docker (ver Dockerfile y docker-compose.yml) o define DATABASE_URL y ejecuta
// `npm run db:postgres-schema -w @parla/api` antes (ver README → Despliegue).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildServices,
  checkTools,
  gatewayBin,
  gatewayDir,
  isWindows,
  mix,
  npm,
  realtimeDir,
  root,
  run,
  step,
  superviseChildren,
  toolPath,
} from './lib/services.mjs';

const apiDir = join(root, 'apps', 'api');

/** Secretos propios: se crean una vez y se guardan fuera del repositorio (apps/api/.secrets). */
function secret(name, envValue, minLength) {
  if (envValue && envValue.length >= minLength) return envValue;
  const dir = join(apiDir, '.secrets');
  const file = join(dir, name);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(48).toString('base64url'));
    console.log(`  Secreto generado en apps/api/.secrets/${name}`);
  }
  return readFileSync(file, 'utf8').trim();
}

checkTools();
if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  step('Instalando dependencias');
  run(npm, ['install']);
}
if (!existsSync(join(apiDir, '.env'))) copyFileSync(join(apiDir, '.env.example'), join(apiDir, '.env'));

step('Compilando contratos, cifrado, core y web');
run(npm, ['run', 'build']);
step('Preparando la base de datos');
run(npm, ['run', 'db:setup', '-w', '@parla/api']);
buildServices({ mixEnv: 'prod' });

const port = process.env.PORT ?? '4100';
const corePort = process.env.PARLA_CORE_PORT ?? '4101';
const realtimePort = process.env.PARLA_REALTIME_PORT ?? '4102';
const origin = process.env.PUBLIC_WEB_URL ?? `http://localhost:${port}`;
const env = {
  ...process.env,
  PATH: toolPath,
  NODE_ENV: 'production',
  JWT_SECRET: secret('jwt-secret', process.env.JWT_SECRET, 32),
  INTERNAL_TOKEN: secret('internal-token', process.env.INTERNAL_TOKEN, 24),
  CORE_URL: `http://localhost:${corePort}`,
  REALTIME_URL: `http://localhost:${realtimePort}`,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? origin,
  PUBLIC_WEB_URL: origin,
};

step(`Arrancando Parla en modo producción → ${origin}`);
superviseChildren([
  spawn(process.execPath, ['dist/main.js'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...env, PORT: corePort, WEB_DIST: '../web/dist' },
  }),
  spawn(mix, ['run', '--no-halt'], {
    cwd: realtimeDir,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...env, MIX_ENV: 'prod', REALTIME_PORT: realtimePort },
  }),
  spawn(gatewayBin, [], {
    cwd: gatewayDir,
    stdio: 'inherit',
    env: { ...env, GATEWAY_PORT: port, REALTIME_LINK_URL: `ws://localhost:${realtimePort}/link` },
  }),
]);
