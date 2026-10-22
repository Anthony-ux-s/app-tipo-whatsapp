#!/usr/bin/env node
// Ejecuta un comando con las variables del .env de la raíz del proyecto cargadas (Prisma, tsx…).
//   node scripts/with-env.mjs prisma migrate deploy
// Las variables que ya estén definidas en el entorno (Docker, el hosting) tienen prioridad sobre el archivo.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
const before = new Set(Object.keys(process.env));
if (existsSync(envFile)) {
  const saved = { ...process.env };
  process.loadEnvFile(envFile);
  // loadEnvFile no pisa lo ya definido; por si acaso, se restaura.
  for (const key of before) process.env[key] = saved[key];
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Uso: node scripts/with-env.mjs <comando> [argumentos]');
  process.exit(1);
}
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(result.status ?? 1);
