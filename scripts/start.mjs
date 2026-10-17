#!/usr/bin/env node
// Un solo comando: instala, prepara la base de datos, carga los datos de ejemplo y arranca
// gateway (Go) + tiempo real (Elixir) + core (NestJS) + web.
//   npm start          todo compilado
//   npm run dev        el core con recarga automática
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildServices, checkTools, npm, ports, root, run, startServices, step } from './lib/services.mjs';

const devMode = process.argv.includes('--dev');

checkTools();

if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  step('Instalando dependencias (solo la primera vez)…');
  run(npm, ['install']);
}

const envFile = join(root, 'apps', 'api', '.env');
if (!existsSync(envFile)) {
  step('Creando apps/api/.env a partir de .env.example');
  copyFileSync(join(root, 'apps', 'api', '.env.example'), envFile);
}

step('Compilando contratos y cifrado compartidos');
run(npm, ['run', 'build:packages']);

if (!devMode) {
  step('Preparando la base de datos (SQLite embebida) y los datos de ejemplo');
  run(npm, ['run', 'db:setup', '-w', '@parla/api']);

  step('Compilando el core (NestJS)');
  run(npm, ['run', 'build', '-w', '@parla/api']);
}

buildServices();

step(`Arrancando: web ${ports.web} · gateway ${ports.gateway} · core ${ports.core} · tiempo real ${ports.realtime}`);
startServices({ core: devMode ? 'dev' : 'start' });

console.log(`
\x1b[32m✔ Parla está listo\x1b[0m
  Abre http://localhost:${ports.web} en el navegador (o en tu celular, en la misma red, para instalarla).
  Usuarios de prueba (contraseña: Parla2026!):
    laura              administradora de Café Andino
    camila             administradora de Proyecto Faro
    andres             colaborador
    +57 300 123 4567   Sofía, colaboradora (entra por teléfono)
  Ctrl + C para detener.
`);
