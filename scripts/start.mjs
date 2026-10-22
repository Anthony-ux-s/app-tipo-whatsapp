#!/usr/bin/env node
// Un solo comando: instala, aplica las migraciones de la base de datos (Supabase) y arranca
// gateway (Go) + tiempo real (Elixir) + core (NestJS) + simuladores de tienda, delivery y pagos + web.
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

const envFile = join(root, '.env');
if (!existsSync(envFile)) {
  copyFileSync(join(root, '.env.example'), envFile);
  console.error('\n✖ Creé el archivo .env a partir de .env.example. Complétalo (sobre todo DATABASE_URL y DIRECT_URL de Supabase) y vuelve a ejecutar el comando.');
  process.exit(1);
}
if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error('\n✖ Faltan DATABASE_URL y DIRECT_URL (conexiones de Supabase) en el archivo .env.');
  process.exit(1);
}

step('Compilando contratos y cifrado compartidos');
run(npm, ['run', 'build:packages']);

if (!devMode) {
  step('Aplicando las migraciones en la base de datos (Supabase)');
  run(npm, ['run', 'db:setup', '-w', '@parla/api']);

  step('Compilando el core (NestJS)');
  run(npm, ['run', 'build', '-w', '@parla/api']);
}

buildServices();

step(`Arrancando: web ${ports.web} · gateway ${ports.gateway} · core ${ports.core} · tiempo real ${ports.realtime} · APIs externas ${ports.providers}`);
startServices({ core: devMode ? 'dev' : 'start' });

console.log(`
\x1b[32m✔ Parla está listo\x1b[0m
  Abre http://localhost:${ports.web} en el navegador (o en tu celular, en la misma red, para instalarla).
  Usuarios de prueba (contraseña: Parla2026!):
    laura              la más activa: grupos, chats y pedidos
    andres             para chatear o llamar a Laura
    tienda             Elena, dueña de Bodega MercaYa: acepta, alista y entrega al repartidor
    repartidor         Carlos, repartidor de Rapidito (también: repartidora, Lucía)
    camila             creó el grupo «Diseño tienda en línea»
    +57 300 123 4567   Sofía (entra con su teléfono)
  Servicios → Mercado: busca «un kilo de azúcar, arroz» y paga con el QR. Con «tienda» acéptalo en
  Delivery → Mi negocio; con «repartidor» tómalo en Delivery → Rapidito y entrégalo con el código del cliente.
  Ctrl + C para detener.
`);
