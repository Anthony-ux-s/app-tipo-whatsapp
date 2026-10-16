#!/usr/bin/env node
// Un solo comando: instala, prepara la base de datos, carga los datos de ejemplo y arranca API + web.
//   npm start
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const devMode = process.argv.includes('--dev');

const step = (title) => console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);

function run(args, cwd = root) {
  const result = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) {
    console.error(`\n✖ Falló: npm ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

if (!devMode) {
  if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
    step('Instalando dependencias (solo la primera vez)…');
    run(['install']);
  }

  const envFile = join(root, 'apps', 'api', '.env');
  if (!existsSync(envFile)) {
    step('Creando apps/api/.env a partir de .env.example');
    copyFileSync(join(root, 'apps', 'api', '.env.example'), envFile);
  }

  step('Compilando contratos y cifrado compartidos');
  run(['run', 'build:packages']);

  step('Preparando la base de datos (SQLite embebida) y los datos de ejemplo');
  run(['run', 'db:setup', '-w', '@parla/api']);

  step('Compilando la API');
  run(['run', 'build', '-w', '@parla/api']);
}

step('Arrancando la API (http://localhost:4100) y la web (http://localhost:3100)');
const children = [
  spawn(npm, ['run', devMode ? 'dev' : 'start', '-w', '@parla/api'], { cwd: root, stdio: 'inherit', shell: isWindows }),
  spawn(npm, ['run', 'dev', '-w', '@parla/web'], { cwd: root, stdio: 'inherit', shell: isWindows }),
];

console.log(`
\x1b[32m✔ Parla está listo\x1b[0m
  Abre http://localhost:3100 en el navegador (o en tu celular, en la misma red, para instalarla).
  Usuarios de prueba (contraseña: Parla2026!):
    laura              administradora de Café Andino
    camila             administradora de Proyecto Faro
    andres             colaborador
    +57 300 123 4567   Sofía, colaboradora (entra por teléfono)
  Ctrl + C para detener.
`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && !stopping && stop());
