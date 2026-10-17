import { expect, test } from '@playwright/test';
import { PASSWORD, registerNewUser } from './helpers';

test.describe('Legal y datos personales', () => {
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
    const { phone } = await registerNewUser(page, 'Persona Temporal', { username });
    await page.getByRole('button', { name: 'Omitir' }).click();
    await page.getByRole('button', { name: 'Entrar a Parla' }).click();
    await expect(page.getByText('¿No tienes chats aún?')).toBeVisible();
    await page.goto('/app/ajustes/datos');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mis datos' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^parla-mis-datos-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8')));
    expect(data.profile.username).toBe(username);
    expect(data.profile.phone).toBe(phone);
    expect(data.termsVersion).toBe('2026-10');
    expect(data.activity).toEqual({ messagesSent: 0, ordersPlaced: 0 });
    expect(data).not.toHaveProperty('workspaces');

    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await page.getByLabel('Tu contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.getByLabel('Usuario o teléfono').fill(phone);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Usuario, teléfono o contraseña incorrectos');
  });
});
