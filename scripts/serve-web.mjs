#!/usr/bin/env node
// Sirve la web ya compilada (apps/web/dist) para `npm start`: unos 20 archivos pequeños, comprimidos y con caché,
// en lugar de los cientos de módulos sueltos del servidor de desarrollo de Vite. Igual que Vite, reenvía la API
// (/api) y el tiempo real (/ws) al gateway, así el navegador solo habla con un origen.
//   PARLA_WEB_PORT=3100 PARLA_API_URL=http://localhost:4100 node scripts/serve-web.mjs
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps', 'web', 'dist');
const port = Number(process.env.PARLA_WEB_PORT ?? 3100);
const api = new URL(process.env.PARLA_API_URL ?? 'http://localhost:4100');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('✖ No encuentro apps/web/dist: compila la web primero (npm run build -w @parla/web).');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);

/** Cada archivo se lee y se comprime una sola vez; si se vuelve a compilar la web (cambia su fecha), se lee de nuevo. */
const cache = new Map();
function load(file) {
  const modified = statSync(file).mtimeMs;
  let entry = cache.get(file);
  if (entry && entry.modified === modified) return entry;
  const body = readFileSync(file);
  const compress = COMPRESSIBLE.has(extname(file)) && body.length > 1024;
  entry = {
    modified,
    identity: body,
    br: compress ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }) : null,
    gzip: compress ? gzipSync(body, { level: 9 }) : null,
  };
  cache.set(file, entry);
  return entry;
}

function sendFile(req, res, file, status = 200) {
  const ext = extname(file);
  const { identity, br, gzip } = load(file);
  const accept = String(req.headers['accept-encoding'] ?? '');
  const headers = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    vary: 'Accept-Encoding',
    // Los archivos con hash en el nombre no cambian nunca; el resto se revisa siempre (para ver las versiones nuevas).
    'cache-control': file.includes(`${dist}${normalize('/assets/')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  let body = identity;
  if (br && accept.includes('br')) (body = br), (headers['content-encoding'] = 'br');
  else if (gzip && accept.includes('gzip')) (body = gzip), (headers['content-encoding'] = 'gzip');
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const isApi = (url) => url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (isApi(url)) {
    const upstream = httpRequest(
      { host: api.hostname, port: api.port, method: req.method, path: url, headers: { ...req.headers, host: api.host } },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 502, error: 'bad_gateway', message: 'El servidor no responde. Inténtalo en un momento.' }));
    });
    req.pipe(upstream);
    return;
  }

  const pathname = decodeURIComponent(url.split('?')[0]);
  const file = normalize(join(dist, pathname));
  if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return sendFile(req, res, file);
  // Rutas de la app (/app/…, /entrar…): siempre la misma página; un archivo que no existe sí es un 404.
  if (extname(pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
    return;
  }
  sendFile(req, res, join(dist, 'index.html'));
});

// Tiempo real: se abre una conexión al gateway y se unen las dos, sin tocar lo que viaja.
server.on('upgrade', (req, socket, head) => {
  if (!(req.url ?? '').startsWith('/ws')) return socket.destroy();
  const upstream = connect(Number(api.port), api.hostname, () => {
    const headers = Object.entries({ ...req.headers, host: api.host }).map(([name, value]) => `${name}: ${value}`).join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(port, () => console.log(`Web compilada en http://localhost:${port} → API y tiempo real en ${api.origin}`));
