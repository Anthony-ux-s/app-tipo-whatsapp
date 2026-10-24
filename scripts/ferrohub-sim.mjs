#!/usr/bin/env node
// FerroHub de mentira para desarrollo y pruebas: implementa del lado de la plataforma lo que Parla espera
// (ver docs/TIENDAS.md → «Ferreterías con FerroHub») para poder probar «Crear tienda → Ferretería» de punta a punta
// mientras el FerroHub real no tiene esos endpoints. NO es seguro ni persistente: nunca en producción.
//
//   npm run ferrohub:sim                       → http://localhost:4300  (genera códigos en la portada)
//   FERROHUB_API_URL=http://localhost:4300     (en el .env del core)
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';

const port = Number(process.env.FERROHUB_SIM_PORT ?? 4300);
const ORIGIN = `http://localhost:${port}`;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;

/** código → { tenantId, usedAt, expiresAt }  ·  tenantId → ferretería  ·  apiKey → tenantId */
const codes = new Map();
const tenants = new Map();
const keys = new Map();
const attempts = new Map();
/** Lo que Parla le manda a esta ferretería (ventas y estados de pedidos), para comprobarlo en las pruebas. */
const log = [];

const randomCode = () => {
  const pick = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `FH-${pick()}-${pick()}`;
};

const PRODUCTS = [
  ['CEM-001', 'Cemento Sol tipo I 42.5 kg', 3250, 120],
  ['CLA-002', 'Clavos 2 pulgadas (kg)', 780, 60],
  ['PIN-003', 'Pintura látex blanco 1 galón', 4590, 18],
  ['TUB-004', 'Tubo PVC 2" x 3 m', 1890, 40],
  ['MAR-005', 'Martillo carpintero 16 oz', 2490, 25],
  ['ALA-006', 'Alambre N°16 (kg)', 820, 0],
];

function newTenant({ nombre, ciudad = 'Trujillo', estado = 'activa', parlaUserId = null, webhook = null }) {
  const tenantId = `t_${randomBytes(4).toString('hex')}`;
  const tenant = { tenantId, nombre, ciudad, estado, parlaUserId, webhook, apiKey: null, linkedStoreId: null };
  tenants.set(tenantId, tenant);
  return tenant;
}

function issueKey(tenant) {
  const apiKey = `wiiil_${randomBytes(12).toString('hex')}`;
  tenant.apiKey = apiKey;
  keys.set(apiKey, tenant.tenantId);
  return apiKey;
}

function newCode(tenant) {
  const code = randomCode();
  codes.set(code, { tenantId: tenant.tenantId, usedAt: null, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

// Una ferretería de ejemplo ya existe, para generar códigos desde la portada.
const demo = newTenant({ nombre: 'Ferretería El Maestro', estado: process.env.FERROHUB_SIM_ESTADO ?? 'activa' });

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
const bearer = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
const tenantOf = (req) => tenants.get(keys.get(bearer(req)));

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  const path = url.pathname;
  const ip = req.socket.remoteAddress ?? 'x';

  if (req.method === 'GET' && path === '/') {
    const code = newCode(demo);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>FerroHub (simulador)</title>
<body style="font-family:system-ui;max-width:520px;margin:48px auto;padding:0 16px">
<h1>FerroHub · simulador</h1><p>Ferretería de ejemplo: <b>${demo.nombre}</b> (${demo.estado}).</p>
<p>Código de enlace (un solo uso, vence en 10 min):</p>
<p style="font-size:34px;font-weight:800;letter-spacing:2px;background:#e6f7f1;padding:16px;border-radius:12px">${code}</p>
<p>Escríbelo en Parla → Crear tienda → Ferretería → «Ya uso FerroHub». <a href="/">Generar otro</a></p></body>`);
  }
  if (req.method === 'GET' && path === '/sim/log') return send(res, 200, { log });
  if (req.method === 'GET' && path === '/sim/new-code') return send(res, 200, { code: newCode(demo) });

  // Dispara un aviso firmado hacia Parla, como haría FerroHub (para probar los webhooks).
  //   POST /sim/event { "parlaStoreId": "…", "tipo": "tienda.cerrada" }
  if (req.method === 'POST' && path === '/sim/event') {
    const body = await readBody(req);
    const tenant = [...tenants.values()].find((t) => t.linkedStoreId === body.parlaStoreId || t.tenantId === body.tenantId);
    if (!tenant?.webhook?.url) return send(res, 404, { error: 'sin_webhook' });
    const payload = JSON.stringify({ eventId: randomBytes(6).toString('hex'), tipo: body.tipo });
    const signature = body.badSignature ? 'f'.repeat(64) : createHmac('sha256', tenant.webhook.secret).update(payload).digest('hex');
    const reply = await fetch(tenant.webhook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ferrohub-signature': signature, 'x-ferrohub-timestamp': String(Math.floor(Date.now() / 1000)) },
      body: payload,
    }).catch(() => null);
    return send(res, 200, { status: reply?.status ?? 0 });
  }

  // ── Plataforma ───────────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/v1/connect/redeem') {
    const body = await readBody(req);
    const recent = (attempts.get(ip) ?? []).filter((t) => Date.now() - t < 60_000);
    if (recent.length >= 5) return send(res, 429, { error: 'demasiados_intentos' });
    const entry = codes.get(String(body.code ?? ''));
    if (!entry) {
      attempts.set(ip, [...recent, Date.now()]);
      return send(res, 404, { error: 'codigo_invalido' });
    }
    if (entry.usedAt) return send(res, 410, { error: 'codigo_usado' });
    if (Date.now() > entry.expiresAt) return send(res, 410, { error: 'codigo_vencido' });
    entry.usedAt = Date.now();
    const tenant = tenants.get(entry.tenantId);
    tenant.linkedStoreId = body.parlaStoreId;
    tenant.webhook = { url: body.webhookUrl, secret: body.webhookSecret };
    return send(res, 200, {
      apiBaseUrl: ORIGIN,
      apiKey: issueKey(tenant),
      permisos: ['productos:leer', 'ventas:crear', 'ventas:anular'],
      tienda: { nombre: tenant.nombre, sucursal: 'Centro' },
    });
  }

  if (req.method === 'DELETE' && path.startsWith('/v1/connect/')) {
    const tenant = tenantOf(req);
    if (!tenant) return send(res, 401, { error: 'llave_invalida' });
    keys.delete(tenant.apiKey);
    tenant.apiKey = null;
    tenant.linkedStoreId = null;
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/v1/provision') {
    const body = await readBody(req);
    const owner = body.owner ?? {};
    const taken = [...tenants.values()].find((t) => t.owner?.email === owner.email && t.parlaUserId !== owner.parlaUserId);
    if (taken) return send(res, 409, { error: 'correo_en_uso', message: 'Ese correo ya está en uso con otra ferretería de FerroHub.' });
    let tenant = [...tenants.values()].find((t) => t.parlaUserId === owner.parlaUserId);
    if (!tenant) {
      tenant = newTenant({ nombre: body.tienda?.nombre ?? 'Mi ferretería', ciudad: body.tienda?.ciudad, estado: 'prueba', parlaUserId: owner.parlaUserId });
      tenant.owner = owner;
    }
    tenant.linkedStoreId = body.parla?.parlaStoreId ?? null;
    tenant.webhook = { url: body.parla?.webhookUrl, secret: body.parla?.webhookSecret };
    return send(res, 201, {
      tenantId: tenant.tenantId,
      plan: 'semilla',
      estado: tenant.estado,
      apiBaseUrl: ORIGIN,
      apiKey: tenant.apiKey ?? issueKey(tenant),
      ssoUrl: `${ORIGIN}/sso?token=${randomBytes(8).toString('hex')}&tenant=${tenant.tenantId}`,
      ssoExpiraEn: 60,
    });
  }

  if (req.method === 'DELETE' && path.startsWith('/v1/provision/')) {
    const id = decodeURIComponent(path.split('/').pop() ?? '');
    const tenant = tenants.get(id);
    if (tenant?.apiKey) keys.delete(tenant.apiKey);
    tenants.delete(id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/v1/sso') {
    const body = await readBody(req);
    const tenant = tenants.get(body.tenantId);
    if (!tenant || tenant.parlaUserId !== body.parlaUserId) return send(res, 404, { error: 'tienda_no_encontrada' });
    return send(res, 200, { ssoUrl: `${ORIGIN}/sso?token=${randomBytes(8).toString('hex')}&tenant=${tenant.tenantId}`, ssoExpiraEn: 60 });
  }

  if (req.method === 'GET' && path === '/sso') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Panel FerroHub</title><body style="font-family:system-ui;padding:48px"><h1>Panel de dueño (simulado)</h1><p>Sesión iniciada sin contraseña para la ferretería <b>${url.searchParams.get('tenant')}</b>.</p></body>`);
  }

  // ── API v1 de la ferretería (RED WIIIL) ──────────────────────────────────────
  if (path.startsWith('/api/v1/')) {
    const tenant = tenantOf(req);
    if (!tenant) return send(res, 401, { error: { code: 'llave_invalida', message: 'Llave no reconocida' } });
    if (req.method === 'GET' && path === '/api/v1/products') {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const list = PRODUCTS.slice(0, limit).map(([codigo, nombre, precio, stock]) => ({ id: codigo, codigo, nombre, precio: precio / 100, stock }));
      return send(res, 200, { data: list, siguiente: PRODUCTS.length > limit ? 'mas' : null });
    }
    if (req.method === 'POST' && path === '/api/v1/sales') {
      const sale = await readBody(req);
      log.push({ tipo: 'venta', tenantId: tenant.tenantId, ...sale });
      return send(res, 201, { data: { id: `sim_${sale.referenciaExterna}`, referenciaExterna: sale.referenciaExterna } });
    }
    if (req.method === 'PATCH' && path.startsWith('/api/v1/orders/')) {
      const { estado } = await readBody(req);
      log.push({ tipo: 'estado', tenantId: tenant.tenantId, ref: decodeURIComponent(path.split('/').pop() ?? ''), estado });
      return send(res, 200, { data: { ok: true } });
    }
    if (req.method === 'GET' && path === '/api/v1/store-info') {
      return send(res, 200, {
        nombre: tenant.nombre,
        tenantId: tenant.tenantId,
        estado: tenant.estado,
        aceptaPedidos: true,
        whatsappAdmin: '51987654321',
        umbralPedidoGrande: 600,
        umbralUnidades: 25,
        horario: { abre: '08:00', cierra: '19:00', dias: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'] },
        sucursales: [{ nombre: 'Centro', direccion: 'Jr. Pizarro 745, Trujillo', lat: -8.1116, lng: -79.0288 }],
      });
    }
    return send(res, 404, { error: { code: 'no_encontrado', message: 'Ruta no soportada por el simulador' } });
  }

  send(res, 404, { error: 'no_encontrado' });
}).listen(port, () => {
  console.log(`FerroHub (simulador) en ${ORIGIN} · abre esa dirección para generar un código de enlace`);
});
