import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, login } from './helpers';

/**
 * «Crear tienda → Ferretería» de punta a punta contra el FerroHub de mentira (`npm run ferrohub:sim`, puerto 4300)
 * y el core con FERROHUB_API_URL=http://localhost:4300. Se omite si el simulador no está encendido.
 */
const SIM = process.env.FERROHUB_SIM_URL ?? 'http://localhost:4300';
const API = process.env.PARLA_API_URL ?? 'http://localhost:4100';

test.describe.configure({ mode: 'serial' });

let prisma: PrismaClient | null = null;

test.beforeAll(async ({ request }) => {
  const up = await request.get(`${SIM}/sim/new-code`).then((r) => r.ok(), () => false);
  test.skip(!up, 'El simulador de FerroHub no está encendido (npm run ferrohub:sim)');
  test.skip(!process.env.DATABASE_URL, 'Hace falta DATABASE_URL (la base de pruebas) para dejar a las cuentas sin tienda');
  prisma = new PrismaClient();
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

/** Las cuentas de ejemplo arrancan sin tienda: se borra la que haya dejado una corrida anterior. */
async function withoutStore(username: string) {
  const user = await prisma!.user.findFirst({ where: { username } });
  if (user) await prisma!.business.deleteMany({ where: { ownerId: user.id } });
}

const newCode = async (request: import('@playwright/test').APIRequestContext) => ((await (await request.get(`${SIM}/sim/new-code`)).json()) as { code: string }).code;

async function openCreateStore(page: Page) {
  await page.getByRole('button', { name: 'Abrir menú' }).first().click();
  await page.getByTestId('menu-tiles').getByRole('link', { name: 'Crear tienda' }).click();
  await expect(page.getByRole('heading', { name: 'Crear tienda' })).toBeVisible();
  await page.getByTestId('create-store-ferreteria').click();
  await expect(page.getByTestId('ferre-options')).toBeVisible();
}

async function token(page: Page) {
  return page.evaluate(() => localStorage.getItem('parla.token') as string);
}

test('conectar con código: categoría → Ferretería → código → tienda verificada con los datos de FerroHub', async ({ page, request }) => {
  await withoutStore('valentina');
  await login(page, 'valentina');
  await openCreateStore(page);

  // Las tres opciones, con «Crear mi ferretería» destacada.
  await expect(page.getByTestId('ferre-connect')).toBeVisible();
  await expect(page.getByTestId('ferre-create')).toBeVisible();
  await expect(page.getByTestId('ferre-simple')).toBeVisible();
  await page.getByTestId('ferre-connect').click();

  // Un código que no existe explica qué hacer.
  const input = page.getByTestId('ferrohub-code');
  await input.fill('zzzz9999');
  await expect(input).toHaveValue('FH-ZZZZ-9999');
  await page.getByTestId('ferrohub-connect').click();
  await expect(page.getByRole('alert')).toContainText('No existe ese código');

  // Con uno bueno (aunque se escriba sin guiones ni mayúsculas) conecta: Mi negocio muestra la conexión y los datos que Parla leyó de FerroHub.
  const code = await newCode(request);
  await input.fill(code.replace(/-/g, '').toLowerCase());
  await expect(input).toHaveValue(code);
  await page.getByTestId('ferrohub-connect').click();
  await expect(page).toHaveURL(/\/app\/negocio$/);
  await expect(page.getByTestId('ferrohub-card')).toContainText('Conectado a FerroHub');
  await expect(page.getByTestId('verified-badge')).toBeVisible();
  // Los datos de la tienda se configuran en FerroHub: ya vino la dirección y no hay formulario de datos en Parla.
  await expect(page.getByTestId('ferrohub-setup')).toHaveCount(0);
  await expect(page.getByTestId('open-ferrohub-data')).toBeVisible();
  await expect(page.getByTestId('open-store-edit')).toHaveCount(0);
  await page.goto('/app/negocio/tienda');
  await expect(page).toHaveURL(/\/app\/negocio$/);

  // Un código ya usado no sirve otra vez (y una tienda conectada no se conecta dos veces).
  const api = await request.post(`${API}/api/stores/ferrohub/connect`, { headers: { authorization: `Bearer ${await token(page)}` }, data: { code } });
  expect(api.status()).toBe(409);
});

test('los clientes ven la ferretería con su insignia «verificada»', async ({ page }) => {
  await login(page, 'andres');
  await page.goto('/app/servicios/c/ferreteria');
  const card = page.getByTestId('store-card').filter({ hasText: 'Ferretería El Maestro' }).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('store-verified')).toHaveText(/Ferretería verificada/);
});

test('los avisos de FerroHub se aceptan firmados y se rechazan con la firma mala', async ({ page, request }) => {
  await login(page, 'valentina');
  const headers = { authorization: `Bearer ${await token(page)}` };
  const business = (await (await request.get(`${API}/api/business`, { headers })).json()) as { business: { id: string; acceptingOrders: boolean } };
  const id = business.business.id;

  // Cierra la tienda desde FerroHub…
  expect((await (await request.post(`${SIM}/sim/event`, { data: { parlaStoreId: id, tipo: 'tienda.cerrada' } })).json()).status).toBe(200);
  expect(((await (await request.get(`${API}/api/business`, { headers })).json()) as typeof business).business.acceptingOrders).toBe(false);
  // …y la reabre.
  await request.post(`${SIM}/sim/event`, { data: { parlaStoreId: id, tipo: 'tienda.abierta' } });
  expect(((await (await request.get(`${API}/api/business`, { headers })).json()) as typeof business).business.acceptingOrders).toBe(true);
  // Firma falsa: Parla no hace nada.
  expect((await (await request.post(`${SIM}/sim/event`, { data: { parlaStoreId: id, tipo: 'tienda.cerrada', badSignature: true } })).json()).status).toBe(401);
  expect(((await (await request.get(`${API}/api/business`, { headers })).json()) as typeof business).business.acceptingOrders).toBe(true);
});

test('desvincular: pide confirmación y la tienda vuelve al catálogo de Parla', async ({ page }) => {
  await login(page, 'valentina');
  await page.goto('/app/negocio');
  await page.getByTestId('ferrohub-unlink').click();
  await page.getByTestId('ferrohub-unlink-confirm').click();
  await expect(page.getByTestId('ferrohub-card')).toHaveCount(0);
});

test('crear mi ferretería: con la cuenta de Parla llega al panel de FerroHub y la tienda queda conectada, sin verificar', async ({ page }) => {
  await withoutStore('mateo');
  await login(page, 'mateo');
  await openCreateStore(page);
  await page.getByTestId('ferre-create').click();

  const submit = page.getByTestId('ferre-create-submit');
  await expect(submit).toBeDisabled();
  await page.getByTestId('ferre-name').fill('Ferretería La Obra');
  await page.getByTestId('ferre-city').fill('Chiclayo');
  await page.getByRole('button', { name: 'Electricidad' }).click();
  await page.getByLabel('Correo').fill('mateo@ferrohub-prueba.pe');
  await page.getByLabel('Celular').fill('999 888 777');
  await expect(submit).toBeEnabled();
  await submit.click();

  // El enlace de un solo uso abre su panel de dueño sin pedir contraseña.
  await expect(page).toHaveURL(new RegExp(`${SIM.replace(/[.]/g, '\\.')}/sso\\?token=`));
  await expect(page.getByRole('heading', { name: 'Panel de dueño (simulado)' })).toBeVisible();

  // De vuelta en Parla: conectada, aún sin la insignia de verificada y con acceso a su panel.
  await page.goto('/app/negocio');
  await expect(page.getByTestId('ferrohub-card')).toContainText('Conectado a FerroHub');
  await expect(page.getByTestId('verified-badge')).toHaveCount(0);
  await page.getByTestId('ferrohub-panel').click();
  await expect(page).toHaveURL(new RegExp(`${SIM.replace(/[.]/g, '\\.')}/sso\\?token=`));
});

test('un correo que ya usa otra ferretería explica el motivo y ofrece conectar con código', async ({ page }) => {
  await withoutStore('diego');
  await login(page, 'diego');
  await page.goto('/app/negocio/nueva/ferreteria/crear');
  await page.getByTestId('ferre-name').fill('Otra Ferretería');
  await page.getByTestId('ferre-city').fill('Lima');
  await page.getByLabel('Correo').fill('mateo@ferrohub-prueba.pe');
  await page.getByLabel('Celular').fill('999 111 222');
  await page.getByTestId('ferre-create-submit').click();
  await expect(page.getByRole('alert')).toContainText('correo ya está en uso');
  await page.getByRole('button', { name: /Conéctala con un código/ }).click();
  await expect(page).toHaveURL(/\/conectar$/);
  expect(await prisma!.business.count({ where: { owner: { username: 'diego' } } })).toBe(0);
});

test('soporte no tiene «Crear tienda» y el servidor lo rechaza', async ({ page, request }) => {
  await login(page, 'soporte');
  const res = await request.post(`${API}/api/stores/ferrohub/connect`, { headers: { authorization: `Bearer ${await token(page)}` }, data: { code: 'FH-7K3M-92QX' } });
  expect(res.status()).toBe(403);
  void PASSWORD;
});
