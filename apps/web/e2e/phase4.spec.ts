import { expect, test } from '@playwright/test';
import { login, openSession, PASSWORD } from './helpers';

test.describe('Fase 4: planes, pagos, legal y datos personales', () => {
  test('la administradora mejora el plan con un pago de prueba y queda en el historial', async ({ browser }) => {
    const camila = await openSession(browser, 'camila');
    // Proyecto Faro está en el plan Gratis; Camila es su administradora
    await camila.page.getByRole('button', { name: /Café Andino|Proyecto Faro/ }).first().click();
    await camila.page.getByRole('button', { name: /Proyecto Faro/ }).last().click();
    await camila.page.goto(camila.page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/plan'));
    await expect(camila.page.getByTestId('current-plan')).toHaveText('Plan Gratis');

    await camila.page.getByTestId('plan-business').getByRole('button', { name: /Pagar 1 mes de Empresa/ }).click();
    await expect(camila.page).toHaveURL(/\/pago\//);
    await expect(camila.page.getByText('Pago de prueba: no se cobrará nada')).toBeVisible();
    await expect(camila.page.getByTestId('checkout-amount')).toContainText('149.900');
    await camila.page.getByRole('button', { name: /^Pagar/ }).click();

    await expect(camila.page).toHaveURL(/\/plan/);
    await expect(camila.page.getByText('¡Pago aprobado! Tu plan ya está activo.')).toBeVisible();
    await expect(camila.page.getByTestId('current-plan')).toHaveText('Plan Empresa');
    await expect(camila.page.getByTestId('payments').locator('li').first()).toContainText('Pagado');

    // El equipo ve el plan nuevo en la vista de equipo
    await camila.page.goto(camila.page.url().replace(/\/plan.*/, '/equipo'));
    await expect(camila.page.getByTestId('plan-badge')).toContainText('Plan Empresa');
    expect(camila.consoleErrors).toEqual([]);
    await camila.context.close();
  });

  test('un pago rechazado no cambia el plan', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    await laura.page.goto(laura.page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/plan'));
    await expect(laura.page.getByTestId('current-plan')).toHaveText('Plan Equipo');
    await laura.page.getByTestId('plan-business').getByRole('button', { name: /Pagar 1 mes de Empresa/ }).click();
    await laura.page.getByRole('button', { name: 'Simular pago rechazado' }).click();
    await expect(laura.page.getByText('El pago fue rechazado. No se hizo ningún cobro.')).toBeVisible();
    await expect(laura.page.getByTestId('current-plan')).toHaveText('Plan Equipo');
    await laura.context.close();
  });

  test('un colaborador ve los planes pero no puede pagar', async ({ page }) => {
    await login(page, 'andres');
    await page.goto(page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/plan'));
    await expect(page.getByTestId('current-plan')).toBeVisible();
    await expect(page.getByText('Solo un administrador puede cambiar el plan.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Pagar 1 mes/ })).toHaveCount(0);
  });

  test('los términos y la privacidad son públicos y el registro enlaza a ellos', async ({ page }) => {
    await page.goto('/legal/terminos');
    await expect(page.getByRole('heading', { name: 'Términos y condiciones' })).toBeVisible();
    await expect(page.getByText(/No hay cobros automáticos/)).toBeVisible();
    await page.getByRole('link', { name: 'Política de privacidad y tratamiento de datos' }).click();
    await expect(page.getByRole('heading', { name: 'Política de privacidad y tratamiento de datos' })).toBeVisible();
    await expect(page.getByText(/Ley 1581 de 2012/).first()).toBeVisible();
    await page.goto('/registro');
    await expect(page.getByRole('link', { name: 'términos del servicio' })).toHaveAttribute('href', '/legal/terminos');
  });

  test('una persona descarga sus datos y elimina su cuenta; ya no puede volver a entrar', async ({ page }) => {
    const username = `borrar${Date.now().toString(36)}`;
    await page.goto('/registro');
    await page.getByLabel('Tu nombre').fill('Persona Temporal');
    await page.getByLabel('Nombre de usuario').fill(username);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/bienvenida/);

    // Crea su propio espacio para llegar a ajustes
    await page.getByLabel('Nombre del espacio').fill('Espacio temporal');
    await page.locator('button[type=submit]', { hasText: 'Crear espacio' }).click();
    await expect(page).toHaveURL(/\/equipo/);
    await page.goto(page.url().replace(/\/equipo.*/, '/ajustes/datos'));

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mis datos' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^parla-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8')));
    expect(data.profile.username).toBe(username);
    expect(data.termsVersion).toBe('2026-10');
    expect(data.workspaces[0]).toMatchObject({ name: 'Espacio temporal', role: 'admin' });

    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await page.getByLabel('Tu contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.getByLabel('Usuario o teléfono').fill(username);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Usuario, teléfono o contraseña incorrectos');
  });
});
