#!/usr/bin/env node
// Simulación de delivery de punta a punta, con las mismas rutas que usa la app (nada se escribe
// directo en la base): los clientes piden y pagan con el QR de prueba, la tienda acepta y entrega,
// y el repartidor toma los pedidos y avanza por las calles mandando su ubicación cada 3 s.
//
//   npm run sim:delivery                          2 pedidos (andres y camila), velocidad ×6
//   npm run sim:delivery -- --pedidos 3           hasta 3 pedidos (andres, camila, valentina)
//   npm run sim:delivery -- --velocidad 3         más lento (1 = velocidad real de una moto)
//   npm run sim:delivery -- --sin-entregar        se detiene en la última parada sin entregar
//
// Necesita los servidores encendidos (npm start). Mientras corre, abre la app como «repartidor»
// (Rapidito → Mis rutas) y como «andres» (Delivery → su pedido) para ver la moto avanzar.

const API = process.env.PARLA_URL ?? 'http://localhost:4100';
const ROUTING = process.env.ROUTING_URL ?? 'https://router.project-osrm.org';
const PASSWORD = 'Parla2026!';
const TICK_MS = 3_100; // el core acepta una ubicación cada 3 s
const MOTO_MPS = 24_000 / 3600; // 24 km/h en la ciudad

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const ORDERS = Math.min(3, Math.max(1, option('pedidos', 2)));
const SPEED = Math.min(30, Math.max(1, option('velocidad', 6)));
const WAIT_S = option('espera', 10);

// Clientes y adónde les llega (alrededor de Bodega MercaYa, Miraflores).
const CUSTOMERS = [
  { user: 'andres', line: 'Av. José Larco 812, Miraflores', reference: 'Edificio azul, dpto. 502', location: { lat: -12.1192, lng: -77.0306 } },
  { user: 'camila', line: 'Calle Berlín 330, Miraflores', reference: 'Frente al parque', location: { lat: -12.1158, lng: -77.0378 } },
  { user: 'valentina', line: 'Av. Grau 610, Barranco', reference: 'Casa con reja verde', location: { lat: -12.1449, lng: -77.0201 } },
].slice(0, ORDERS);
const DRIVER_START = { lat: -12.1325, lng: -77.0262 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);

async function call(token, method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : `${API}/api${path}`, {
    method,
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.message ?? text}`);
  return data;
}

async function login(identifier) {
  const { token, user } = await call(null, 'POST', '/auth/login', { identifier, password: PASSWORD });
  return { token, user };
}

/** Distancia en metros (haversine). */
function meters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

/** Recorrido por las calles (OSRM); si no responde, en línea recta. */
async function streetPath(from, to) {
  try {
    const res = await fetch(`${ROUTING}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(5_000) });
    const body = await res.json();
    const coords = body.routes?.[0]?.geometry?.coordinates;
    if (coords?.length > 1) return [from, ...coords.map(([lng, lat]) => ({ lat, lng })), to];
  } catch {
    // línea recta
  }
  return [from, to];
}

/** Puntos cada `step` metros a lo largo del recorrido. */
function walk(path, step) {
  const out = [];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const len = meters(a, b);
    let at = step - carry;
    while (at <= len) {
      const t = at / len;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      at += step;
    }
    carry = len - (at - step);
  }
  out.push(path[path.length - 1]);
  return out;
}

async function waitFor(check, what, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(700);
  }
  throw new Error(`Se esperó demasiado: ${what}`);
}

async function main() {
  log(`Simulación: ${ORDERS} pedido(s), velocidad ×${SPEED}`);
  const store = await login('tienda');
  const driver = await login('repartidor');
  const customers = await Promise.all(CUSTOMERS.map(async (c) => ({ ...c, token: (await login(c.user)).token })));

  // El repartidor se conecta cerca de la tienda (las ofertas llegan primero a los que están a menos de 3 km).
  await call(driver.token, 'POST', '/driver/online', { online: true });
  await call(driver.token, 'POST', '/driver/location', DRIVER_START);

  const catalog = await call(customers[0].token, 'GET', '/services/mercado/products?q=');
  const products = (Array.isArray(catalog) ? catalog : (catalog.items ?? [])).filter((p) => p.stock > 3);
  if (!products.length) throw new Error('La tienda no tiene productos con stock');

  const orders = [];
  for (const [i, c] of customers.entries()) {
    const picks = [products[i % products.length], products[(i + 2) % products.length]];
    const order = await call(c.token, 'POST', '/services/mercado/orders', {
      items: [...new Map(picks.map((p) => [p.id, { productId: p.id, quantity: 1 + (i % 2) }])).values()],
      address: { line: c.line, reference: c.reference, location: c.location },
      tipCents: [200, 0, 300][i],
    });
    // Paga con el QR de prueba (la billetera avisa al gateway y el pedido queda pagado).
    await call(null, 'POST', order.payment.payUrl);
    await waitFor(async () => (await call(c.token, 'GET', `/orders/${order.id}`)).status === 'paid', `el pago de ${c.user}`);
    await call(store.token, 'POST', `/business/orders/${order.id}/accept`);
    await call(store.token, 'POST', `/business/orders/${order.id}/ready`);
    await call(driver.token, 'POST', `/driver/orders/${order.id}/accept`);
    const full = await call(c.token, 'GET', `/orders/${order.id}`);
    orders.push({ id: order.id, customer: c, code: full.deliveryCode, fee: full.deliveryFeeCents });
    log(`Pedido ${order.id} de ${c.user}: pagado, aceptado por la tienda y tomado por el repartidor (envío S/ ${(full.deliveryFeeCents / 100).toFixed(2)}, código ${full.deliveryCode})`);
  }

  // Pedidos que ya llevaba (p. ej. de una simulación anterior): también se recorren y se entregan.
  const { mine } = await call(driver.token, 'GET', '/driver/orders');
  for (const o of mine.filter((o) => (o.status === 'driver_assigned' || o.status === 'on_the_way') && !orders.some((x) => x.id === o.id))) {
    for (const c of customers) {
      const full = await call(c.token, 'GET', `/orders/${o.id}`).catch(() => null);
      if (!full) continue;
      orders.push({ id: o.id, customer: c, code: full.deliveryCode, fee: full.deliveryFeeCents });
      log(`Retomado el pedido en curso ${o.id} de ${c.user}`);
      break;
    }
  }

  console.log(`
  \x1b[32mListo para salir.\x1b[0m Abre http://localhost:3100 para mirarlo en vivo:
    · repartidor  → ☰ → Mis rutas (orden óptimo, el ${'🛵'} avanzando)
    · ${customers[0].user.padEnd(10)}  → ☰ → Mis pedidos → su pedido (seguimiento en vivo)
    · tienda      → Delivery → Mi negocio
  Arranca en ${WAIT_S} s…
`);
  await sleep(WAIT_S * 1000);

  const step = MOTO_MPS * (TICK_MS / 1000) * SPEED;
  let here = DRIVER_START;
  const pickedUp = new Set();
  for (;;) {
    const plan = await call(driver.token, 'GET', '/driver/route-plan');
    const next = plan.stops[0];
    if (!next) break;
    const isLast = plan.stops.length === 1;
    log(`${next.label} (${plan.stops.length} parada(s), ${plan.totalKm.toFixed(1)} km en total)`);
    const points = walk(await streetPath(here, next.point), step);
    for (const p of points) {
      await sleep(TICK_MS);
      await call(driver.token, 'POST', '/driver/location', p).catch(() => undefined);
      here = p;
    }
    await sleep(2_500);
    const order = orders.find((o) => o.id === next.orderId);
    if (next.kind === 'pickup') {
      // En la tienda: la dueña confirma que se lo entregó (los que esperan en la tienda se recogen juntos).
      for (const s of plan.stops.filter((s) => s.kind === 'pickup' && meters(s.point, next.point) < 50 && !pickedUp.has(s.orderId))) {
        await call(store.token, 'POST', `/business/orders/${s.orderId}/handoff`);
        pickedUp.add(s.orderId);
        log(`Recogido en la tienda: ${s.orderId}`);
      }
    } else if (isLast && flag('sin-entregar')) {
      log('Llegó a la última parada (--sin-entregar: el pedido queda en camino).');
      break;
    } else {
      await call(driver.token, 'POST', `/driver/orders/${next.orderId}/deliver`, { code: order.code });
      log(`Entregado a ${order.customer.user} con el código ${order.code}`);
    }
  }
  console.log('\n  \x1b[32m✔ Simulación terminada.\x1b[0m Las entregas quedan en Rapidito → Mis rutas → Historial.\n');
}

main().catch((err) => {
  console.error(`\x1b[31m✖ ${err.message}\x1b[0m`);
  process.exitCode = 1;
});
