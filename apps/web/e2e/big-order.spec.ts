import { PrismaClient } from '@prisma/client';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Pedido grande de punta a punta. La ferretería se conecta con el FerroHub de mentira (npm run ferrohub:sim) y el pedido
 * se crea por el endpoint interno del core, igual que lo hace el gateway al cobrar. Se omite si falta el simulador o la base.
 */
const SIM = process.env.FERROHUB_SIM_URL ?? 'http://localhost:4300';
const API = process.env.PARLA_API_URL ?? 'http://localhost:4100';
const CORE = process.env.PARLA_CORE_URL ?? 'http://localhost:4201';
const INTERNAL = { 'x-internal-token': process.env.INTERNAL_TOKEN ?? 'parla-dev-internal-token' };

test.describe.configure({ mode: 'serial' });

let prisma: PrismaClient | null = null;
const RUN = Date.now().toString(36);
const NORMAL = `ord_normal${RUN}`;
const GRANDE = `ord_grande${RUN}`;
let storeId = '';
let customerId = '';

test.beforeAll(async ({ request }) => {
  const up = await request.get(`${SIM}/sim/new-code`).then((r) => r.ok(), () => false);
  test.skip(!up, 'El simulador de FerroHub no está encendido (npm run ferrohub:sim)');
  test.skip(!process.env.DATABASE_URL, 'Hace falta DATABASE_URL (la base de pruebas)');
  prisma = new PrismaClient();
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

const token = (page: Page) => page.evaluate(() => localStorage.getItem('parla.token') as string);

async function newOrder(request: APIRequestContext, over: { id: string; quantity: number; unitPriceCents: number }) {
  const subtotal = over.quantity * over.unitPriceCents;
  const created = await request.post(`${CORE}/api/internal/orders`, {
    headers: INTERNAL,
    data: {
      id: over.id,
      userId: customerId,
      service: storeId,
      lines: [{ productId: 'CEM-001', name: 'Cemento Sol 42.5 kg', unit: 'bolsa', quantity: over.quantity, unitPriceCents: over.unitPriceCents, totalCents: subtotal }],
      subtotalCents: subtotal,
      deliveryFeeCents: 650,
      tipCents: 0,
      totalCents: subtotal + 650,
      currency: 'PEN',
      address: { line: 'Av. Larco 123, Miraflores', reference: 'Puerta verde' },
      payment: { provider: 'PagaYa', qrText: 'http://pagaya/x', payUrl: 'http://pagaya/x', expiresAt: new Date(Date.now() + 600_000).toISOString(), paidAt: null },
      deliveryQuoteId: 'q_1',
      etaMinutes: 30,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
}

const pay = (request: APIRequestContext, id: string) =>
  request.patch(`${CORE}/api/internal/orders/${id}`, { headers: INTERNAL, data: { expectStatus: 'pending_payment', status: 'paid' } });

test('prepara la ferretería conectada (con los umbrales de FerroHub) y la clienta', async ({ page, request }) => {
  const owner = await prisma!.user.findFirst({ where: { username: 'camila' } });
  const customer = await prisma!.user.findFirst({ where: { phone: '+573001234567' } });
  expect(owner && customer).toBeTruthy();
  customerId = customer!.id;
  await prisma!.business.deleteMany({ where: { ownerId: owner!.id } });

  const code = ((await (await request.get(`${SIM}/sim/new-code`)).json()) as { code: string }).code;
  await login(page, 'camila');
  const res = await request.post(`${API}/api/stores/ferrohub/connect`, { headers: { authorization: `Bearer ${await token(page)}` }, data: { code } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { business: { id: string; status: string } };
  expect(body.business.status).toBe('approved');
  storeId = body.business.id;

  // Los umbrales de la ferretería vienen de su ficha en FerroHub (S/ 600 y 25 unidades) y se ven al cotizar.
  const summary = (await (await request.get(`${API}/api/stores/${storeId}`, { headers: { authorization: `Bearer ${await token(page)}` } })).json()) as { bigOrder: { totalCents: number; units: number; whatsapp: string | null } };
  expect(summary.bigOrder).toEqual({ totalCents: 60_000, units: 25, whatsapp: '51987654321' });
});

test('cada paso del pedido llega a la ferretería con su estado', async ({ request }) => {
  await newOrder(request, { id: `${NORMAL}e`, quantity: 1, unitPriceCents: 3250 });
  await pay(request, `${NORMAL}e`);
  await request.patch(`${CORE}/api/internal/orders/${NORMAL}e`, { headers: INTERNAL, data: { status: 'cancelled', note: 'prueba' } });
  await expect
    .poll(async () => {
      const { log } = (await (await request.get(`${SIM}/sim/log`)).json()) as { log: { tipo: string; ref?: string; estado?: string }[] };
      return log.filter((l) => l.tipo === 'estado' && l.ref === `${NORMAL}e`).map((l) => l.estado);
    })
    .toEqual(['nuevo', 'cancelado']);
});

test('un pedido normal no cambia nada: sin etiqueta ni aviso de pedido grande', async ({ page, request }) => {
  await newOrder(request, { id: NORMAL, quantity: 2, unitPriceCents: 3250 });
  expect((await pay(request, NORMAL)).ok()).toBe(true);

  await login(page, 'camila');
  await page.goto('/app/negocio');
  const item = page.getByTestId('business-order-item').filter({ hasText: 'S/ 71' }).first();
  await expect(item).toBeVisible();
  await expect(item.getByTestId('big-order-tag')).toHaveCount(0);
});

test('un pedido grande: etiqueta GRANDE arriba de todo, alerta y WhatsApp del cliente para la tienda', async ({ page, request }) => {
  await newOrder(request, { id: GRANDE, quantity: 30, unitPriceCents: 3250 });
  expect((await pay(request, GRANDE)).ok()).toBe(true);

  await login(page, 'camila');
  await page.goto('/app/negocio');
  // Aunque es más viejo que el normal en la lista, el grande por confirmar va primero.
  const first = page.getByTestId('business-order-item').first();
  await expect(first.getByTestId('big-order-tag')).toBeVisible();
  await first.click();
  await expect(page.getByTestId('big-order-alert')).toContainText('Confírmalo con el cliente antes de prepararlo');
  const wa = page.getByTestId('whatsapp-customer');
  await expect(wa).toBeVisible();
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/573001234567\?text=/);
});

test('la clienta ve el aviso de pedido grande y cómo escribir a la tienda por WhatsApp', async ({ page }) => {
  await login(page, '+57 300 123 4567');
  await page.goto(`/app/pedidos/${GRANDE}`);
  const notice = page.getByTestId('big-order-notice');
  await expect(notice).toContainText('Es un pedido grande');
  await expect(notice.getByTestId('big-order-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/51987654321\?text=/);

  await page.goto(`/app/pedidos/${NORMAL}`);
  await expect(page.getByTestId('big-order-notice')).toHaveCount(0);
});

test('el teléfono del cliente solo se le da a la tienda en un pedido grande', async ({ page, request }) => {
  await login(page, 'camila');
  const headers = { authorization: `Bearer ${await token(page)}` };
  const normal = (await (await request.get(`${API}/api/business/orders/${NORMAL}`, { headers })).json()) as { customer: { phone?: string | null } };
  const big = (await (await request.get(`${API}/api/business/orders/${GRANDE}`, { headers })).json()) as { big: boolean; customer: { phone?: string | null } };
  expect(normal.customer.phone ?? null).toBeNull();
  expect(big).toMatchObject({ big: true, customer: { phone: '+573001234567' } });
});
