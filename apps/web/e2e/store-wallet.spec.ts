import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * «Mis ventas y depósitos» de una tienda: las ventas entregadas se siembran en la base de pruebas (entregar un pedido es
 * otro flujo, ya cubierto en el core) y lo demás —guardar el PagaYa, «Retirar ahora» por el gateway, el depósito
 * automático— se hace de verdad. Se omite sin DATABASE_URL.
 */
const API = process.env.PARLA_API_URL ?? 'http://localhost:4100';

test.describe.configure({ mode: 'serial' });

let prisma: PrismaClient | null = null;
let businessId = '';

test.beforeAll(async () => {
  test.skip(!process.env.DATABASE_URL, 'Hace falta DATABASE_URL (la base de pruebas)');
  prisma = new PrismaClient();
  const owner = await prisma.user.findFirst({ where: { username: 'diego' } });
  expect(owner).toBeTruthy();
  await prisma.business.deleteMany({ where: { ownerId: owner!.id } });
  const business = await prisma.business.create({
    data: { name: 'Ferretería La Billetera', service: 'ferreteria', ownerId: owner!.id, address: 'Av. Prueba 100', status: 'approved' },
  });
  businessId = business.id;
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

const sell = (orderId: string, saleCents: number) =>
  prisma!.storeLedgerEntry.createMany({
    data: [
      { businessId, orderId, kind: 'sale', amountCents: saleCents },
      { businessId, orderId, kind: 'commission', amountCents: -Math.round(saleCents * 0.05) },
    ],
  });

test('sin ventas: saldo en cero, la comisión a la vista y «Retirar ahora» apagado', async ({ page }) => {
  await login(page, 'diego');
  await page.goto('/app/negocio');
  const wallet = page.getByTestId('store-wallet');
  await expect(wallet).toBeVisible();
  await expect(page.getByTestId('store-wallet-balance')).toHaveText('S/ 0.00');
  await expect(wallet).toContainText('comisión de Parla (5 %)');
  await expect(page.getByTestId('store-withdraw')).toBeDisabled();
});

test('con ventas entregadas muestra el saldo neto y cada movimiento; sin PagaYa no se puede retirar', async ({ page }) => {
  await sell(`ord_billetera1`, 50_000);
  await login(page, 'diego');
  await page.goto('/app/negocio');
  // S/ 500.00 vendidos − 5 % (S/ 25.00) = S/ 475.00
  await expect(page.getByTestId('store-wallet-balance')).toHaveText('S/ 475.00');
  await expect(page.getByTestId('store-ledger-entry')).toHaveCount(2);
  await expect(page.getByTestId('store-wallet')).toContainText('Venta entregada');
  await expect(page.getByTestId('store-wallet')).toContainText('Comisión de Parla');
  await expect(page.getByTestId('store-withdraw')).toBeDisabled();
});

test('guarda su PagaYa (rechaza uno inválido) y retira todo: el saldo queda en cero y el depósito figura pagado', async ({ page }) => {
  await login(page, 'diego');
  await page.goto('/app/negocio');
  const phone = page.getByTestId('store-payout-phone');
  await phone.fill('12345');
  await page.getByTestId('store-save-payout-phone').click();
  await expect(page.getByRole('alert')).toContainText('9 dígitos');

  await phone.fill('955 111 222');
  await page.getByTestId('store-save-payout-phone').click();
  await expect(page.getByTestId('store-save-payout-phone')).toHaveCount(0);
  await expect(page.getByTestId('store-withdraw')).toBeEnabled();

  await page.getByTestId('store-withdraw').click();
  await expect(page.getByTestId('store-wallet-balance')).toHaveText('S/ 0.00');
  await expect(page.getByTestId('store-wallet')).toContainText('Depósito a tu PagaYa');
  await expect(page.getByTestId('store-withdraw')).toBeDisabled();
  const payout = await prisma!.storeLedgerEntry.findFirst({ where: { businessId, kind: 'payout' } });
  expect(payout).toMatchObject({ status: 'paid', amountCents: -47_500, reason: 'manual' });
  expect(payout!.id).toMatch(/^sp_/);
  expect(payout!.transferId).toBeTruthy();
});

test('el servidor no deja retirar dos veces el mismo dinero ni retirar sin saldo', async ({ page, request }) => {
  await login(page, 'diego');
  const headers = { authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('parla.token'))}` };
  const again = await request.post(`${API}/api/business/payouts`, { headers });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { message: string }).message).toContain('No tienes saldo para retirar');
});

test('un usuario sin tienda no tiene billetera', async ({ page, request }) => {
  await login(page, 'mateo');
  const token = await page.evaluate(() => localStorage.getItem('parla.token'));
  await prisma!.business.deleteMany({ where: { owner: { username: 'mateo' } } });
  const res = await request.get(`${API}/api/business/wallet`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(404);
});
