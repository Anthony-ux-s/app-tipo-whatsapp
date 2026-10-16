#!/usr/bin/env node
// Producción en un solo proceso: compila todo y la API sirve también la web (PWA) en el mismo puerto.
//   npm run start:prod            → http://localhost:4100
//   PORT=8080 npm run start:prod
// Para PostgreSQL usa Docker (ver Dockerfile y docker-compose.yml) o define DATABASE_URL y ejecuta
// `npm run db:postgres-schema -w @parla/api` antes (ver README → Despliegue).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const step = (title) => console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);

function run(args, cwd = root) {
  const result = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) {
    console.error(`\n✖ Falló: npm ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

/** Secreto propio para firmar sesiones: se crea una vez y se guarda fuera del repositorio. */
function jwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return process.env.JWT_SECRET;
  const dir = join(apiDir, '.secrets');
  const file = join(dir, 'jwt-secret');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(48).toString('base64url'));
    console.log('  Secreto de sesiones generado en apps/api/.secrets/jwt-secret');
  }
  return readFileSync(file, 'utf8').trim();
}

if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  step('Instalando dependencias');
  run(['install']);
}
if (!existsSync(join(apiDir, '.env'))) copyFileSync(join(apiDir, '.env.example'), join(apiDir, '.env'));

step('Compilando contratos, cifrado, API y web');
run(['run', 'build']);
step('Preparando la base de datos');
run(['run', 'db:setup', '-w', '@parla/api']);

const port = process.env.PORT ?? '4100';
const origin = process.env.PUBLIC_WEB_URL ?? `http://localhost:${port}`;
step(`Arrancando Parla en modo producción → ${origin}`);
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    JWT_SECRET: jwtSecret(),
    WEB_DIST: '../web/dist',
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? origin,
    PUBLIC_WEB_URL: origin,
  },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
