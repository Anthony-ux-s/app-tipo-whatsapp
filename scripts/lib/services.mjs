// Piezas comunes para arrancar Parla: puertos, herramientas (Go, Elixir) y los cinco procesos.
//
//   navegador ──► web (3100) ──► gateway Go (4100) ──┬─► core NestJS (4101)        REST
//                                                     ├─► realtime Elixir (4102)    WebSocket
//                                                     └─► tienda, delivery y pagos  APIs externas
//                                                         (simuladas en services/providers, 4103)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const isWindows = process.platform === 'win32';
export const npm = isWindows ? 'npm.cmd' : 'npm';

export const ports = {
  web: Number(process.env.PARLA_WEB_PORT ?? 3100),
  gateway: Number(process.env.PARLA_GATEWAY_PORT ?? 4100),
  core: Number(process.env.PARLA_CORE_PORT ?? 4101),
  realtime: Number(process.env.PARLA_REALTIME_PORT ?? 4102),
  providers: Number(process.env.PARLA_PROVIDERS_PORT ?? 4103),
};

const DEV_JWT_SECRET = 'parla-dev-secret-cambiar-en-produccion';
const DEV_INTERNAL_TOKEN = 'parla-dev-internal-token';
const DEV_PAGAYA_SECRET = 'pagaya-dev-secret';
const DEV_MERCAYA_KEY = 'mercaya-dev-clave';

export const step = (title) => console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);

/** Carpetas de instalación habituales, por si Go o Elixir no quedaron en el PATH de esta terminal. */
const TOOL_DIRS = isWindows
  ? ['C:\\Program Files\\Go\\bin', 'C:\\Program Files\\Erlang OTP\\bin', 'C:\\Program Files\\Elixir\\bin']
  : ['/usr/local/go/bin', '/opt/homebrew/bin', '/usr/local/bin'];

/** PATH con las herramientas encontradas; se pasa a todos los procesos hijos. */
export const toolPath = [...TOOL_DIRS.filter((dir) => existsSync(dir)), process.env.PATH ?? ''].join(delimiter);

function hasTool(command, args) {
  const result = spawnSync(command, args, { env: { ...process.env, PATH: toolPath }, shell: isWindows, stdio: 'ignore' });
  return result.status === 0;
}

export function checkTools() {
  const missing = [];
  if (!hasTool('go', ['version'])) missing.push('Go 1.23+ (https://go.dev/dl)');
  if (!hasTool(isWindows ? 'mix.bat' : 'mix', ['--version'])) missing.push('Elixir 1.17+ con Erlang/OTP 27+ (https://elixir-lang.org/install.html)');
  if (missing.length) {
    console.error(`\n✖ Faltan herramientas para el gateway y el tiempo real:\n  - ${missing.join('\n  - ')}`);
    process.exit(1);
  }
}

export function run(command, args, { cwd = root, env = {} } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: isWindows, env: { ...process.env, PATH: toolPath, ...env } });
  if (result.status !== 0) {
    console.error(`\n✖ Falló: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

export const gatewayDir = join(root, 'services', 'gateway');
export const realtimeDir = join(root, 'services', 'realtime');
export const gatewayBin = join(gatewayDir, 'bin', isWindows ? 'gateway.exe' : 'gateway');
export const providersDir = join(root, 'services', 'providers');
export const providersBin = join(providersDir, 'bin', isWindows ? 'providers.exe' : 'providers');
export const mix = isWindows ? 'mix.bat' : 'mix';

/** Compila el gateway y los simuladores de APIs externas (Go) y prepara el tiempo real (Elixir). */
export function buildServices({ mixEnv = 'dev' } = {}) {
  const env = { MIX_ENV: mixEnv };
  step('Compilando el gateway (Go)');
  run('go', ['build', '-o', gatewayBin, './cmd/gateway'], { cwd: gatewayDir });
  step('Compilando los simuladores de tienda, delivery y pagos (Go)');
  run('go', ['build', '-o', providersBin, './cmd/providers'], { cwd: providersDir });
  step('Preparando el tiempo real (Elixir)');
  if (!hasHex()) run(mix, ['local.hex', '--force'], { cwd: realtimeDir, env });
  run(mix, ['deps.get'], { cwd: realtimeDir, env });
  run(mix, ['compile'], { cwd: realtimeDir, env });
}

function hasHex() {
  const result = spawnSync(mix, ['hex.info'], { cwd: realtimeDir, env: { ...process.env, PATH: toolPath }, shell: isWindows, stdio: 'ignore' });
  return result.status === 0;
}

/** Variables compartidas: los procesos deben coincidir en secretos y direcciones. */
export function sharedEnv() {
  return {
    PATH: toolPath,
    JWT_SECRET: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
    INTERNAL_TOKEN: process.env.INTERNAL_TOKEN ?? DEV_INTERNAL_TOKEN,
    PAGAYA_WEBHOOK_SECRET: process.env.PAGAYA_WEBHOOK_SECRET ?? DEV_PAGAYA_SECRET,
    // Clave de la API de administración de la tienda (la dueña cambia precios, ofertas y stock).
    MERCAYA_ADMIN_KEY: process.env.MERCAYA_ADMIN_KEY ?? DEV_MERCAYA_KEY,
    CORE_URL: `http://localhost:${ports.core}`,
    REALTIME_URL: `http://localhost:${ports.realtime}`,
    PROVIDERS_URL: `http://localhost:${ports.providers}`,
    // La billetera avisa los pagos al gateway (webhook firmado).
    GATEWAY_PUBLIC_URL: `http://localhost:${ports.gateway}`,
  };
}

/** Simuladores de tienda (MercaYa), delivery (Rapidito) y pagos con QR (PagaYa). */
export function spawnProviders(env, extra = {}) {
  return spawn(providersBin, [], {
    cwd: providersDir,
    stdio: 'inherit',
    env: {
      ...env,
      PROVIDERS_PORT: String(ports.providers),
      PROVIDERS_PUBLIC_URL: process.env.PROVIDERS_PUBLIC_URL ?? `http://localhost:${ports.providers}`,
      ...extra,
    },
  });
}

/**
 * Lanza los cinco procesos. `core` indica cómo arrancar NestJS ('start' compilado o 'dev' con recarga).
 */
export function startServices({ core = 'start' } = {}) {
  const env = { ...process.env, ...sharedEnv() };
  const children = [
    spawn(npm, ['run', core, '-w', '@parla/api'], {
      cwd: root,
      stdio: 'inherit',
      shell: isWindows,
      env: { ...env, PORT: String(ports.core), WEB_ORIGIN: `http://localhost:${ports.web}` },
    }),
    spawn(mix, ['run', '--no-halt'], {
      cwd: realtimeDir,
      stdio: 'inherit',
      shell: isWindows,
      env: { ...env, REALTIME_PORT: String(ports.realtime) },
    }),
    spawn(gatewayBin, [], {
      cwd: gatewayDir,
      stdio: 'inherit',
      env: {
        ...env,
        GATEWAY_PORT: String(ports.gateway),
        REALTIME_LINK_URL: `ws://localhost:${ports.realtime}/link`,
        WEB_ORIGIN: `http://localhost:${ports.web}`,
      },
    }),
    spawnProviders(env),
    spawn(npm, ['run', 'dev', '-w', '@parla/web'], {
      cwd: root,
      stdio: 'inherit',
      shell: isWindows,
      env: { ...env, PARLA_WEB_PORT: String(ports.web), PARLA_API_URL: `http://localhost:${ports.gateway}` },
    }),
  ];
  superviseChildren(children);
  return children;
}

/** Ctrl + C detiene solo los procesos que lanzó este comando; si uno se cae, se detienen todos. */
export function superviseChildren(children) {
  let stopping = false;
  const stop = (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode !== null) continue;
      if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
    process.exit(exitCode);
  };
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  for (const child of children) {
    child.on('exit', (code) => {
      if (stopping) return;
      console.error(`\n✖ Un servidor se detuvo (código ${code}). Revisa el mensaje de arriba.`);
      stop(code || 1);
    });
  }
}
