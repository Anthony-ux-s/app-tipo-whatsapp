import { expect, test } from '@playwright/test';
import { openSession } from './helpers';

test.describe('La dueña administra su tienda', () => {
  test('pausa los pedidos (nadie puede pagar), los reanuda, y pone un producto en oferta', async ({ browser }) => {
    const elena = await openSession(browser, 'tienda');
    const laura = await openSession(browser, 'laura');
    const token = await laura.page.evaluate(() => localStorage.getItem('parla.token'));
    const headers = { authorization: `Bearer ${token}` };
    const quote = () =>
      laura.page.request.post('/api/services/mercado/quote', {
        headers,
        data: { items: [{ productId: 'SAL-YOD-1K', quantity: 1 }], address: { line: 'Jr. Unión 456, Lima', reference: '' } },
      });

    // Pausa: el cliente ve «Cerrado» y el gateway no cotiza ni cobra
    await elena.page.goto('/app/negocio');
    await expect(elena.page.getByTestId('store-open')).toHaveAttribute('data-open', 'true');
    await elena.page.getByRole('switch', { name: /Recibir pedidos/ }).click();
    await expect(elena.page.getByTestId('store-open')).toHaveAttribute('data-open', 'false');
    await laura.page.goto('/app/servicios/mercado');
    await expect(laura.page.getByTestId('store-closed')).toContainText('Bodega MercaYa pausó los pedidos');
    const closed = await quote();
    expect(closed.status()).toBe(409);
    expect((await closed.json()).message).toContain('pausó los pedidos');

    // Reanuda: vuelve a cotizar
    await elena.page.getByRole('switch', { name: /Recibir pedidos/ }).click();
    await expect(elena.page.getByTestId('store-open')).toHaveAttribute('data-open', 'true');
    expect((await quote()).ok()).toBe(true);

    // Oferta: la sal pasa de S/ 1.90 a S/ 1.50 con precio normal S/ 1.90
    await elena.page.getByTestId('open-catalog').click();
    await expect(elena.page.getByRole('heading', { name: 'Catálogo y precios' })).toBeVisible();
    await elena.page.getByRole('button', { name: 'Editar Sal de mesa yodada' }).click();
    await elena.page.getByLabel('Precio de venta (S/)').fill('1.50');
    await elena.page.getByLabel('Precio normal (S/)').fill('1.90');
    await elena.page.getByTestId('save-product').click();
    const salt = elena.page.getByTestId('catalog-item').filter({ hasText: 'Sal de mesa yodada' });
    await expect(salt).toContainText('S/ 1.50');
    await expect(salt).toContainText('-21 %');

    // Laura la ve en Ofertas con el precio nuevo, y el gateway cobra ese precio
    await laura.page.goto('/app/ofertas');
    const offer = laura.page.getByTestId('offers-mercado').getByTestId('product').filter({ hasText: 'Sal de mesa yodada' });
    await expect(offer).toContainText('S/ 1.50');
    expect((await (await quote()).json()).lines[0].unitPriceCents).toBe(150);

    // Se agota y se repone desde la lista
    await salt.getByTestId('stock-pill').click();
    await expect(salt.getByTestId('stock-pill')).toHaveText('Agotado');
    await salt.getByTestId('stock-pill').click();
    await expect(salt.getByTestId('stock-pill')).toHaveText('10 en stock');

    // Se deja como estaba para las demás pruebas
    await elena.page.getByRole('button', { name: 'Editar Sal de mesa yodada' }).click();
    await elena.page.getByLabel('Precio de venta (S/)').fill('1.90');
    await elena.page.getByLabel('Precio normal (S/)').fill('');
    await elena.page.getByLabel('Stock (unidades)').fill('140');
    await elena.page.getByTestId('save-product').click();
    await expect(salt).not.toContainText('%');

    for (const s of [elena, laura]) {
      expect(s.consoleErrors.filter((e) => !e.includes('status of 409'))).toEqual([]);
      await s.context.close();
    }
  });
});
