import { expect, test } from '@playwright/test';
import { login, openChat, openSession, unique } from './helpers';

test.describe('Flujo principal: conversar en tiempo real con cifrado de extremo a extremo', () => {
  test('Laura escribe, Andrés lo recibe descifrado, lo lee y responde', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const andres = await openSession(browser, 'andres');
    const text = unique('¿Confirmas la ruta del jueves?');

    // Laura envía el mensaje
    await openChat(laura.page, 'Andrés Rojas');
    await laura.page.getByLabel('Escribe un mensaje').fill(text);
    await laura.page.getByRole('button', { name: 'Enviar mensaje' }).click();
    const sent = laura.page.getByTestId('message').filter({ hasText: text });
    await expect(sent).toBeVisible();

    // Andrés lo ve llegar en su lista (en tiempo real) y lo abre
    const item = andres.page.getByTestId('chat-item').filter({ hasText: 'Laura Méndez' });
    await expect(item).toContainText(text);
    await item.click();
    await expect(andres.page.getByTestId('message').filter({ hasText: text })).toBeVisible();

    // Laura ve el doble check de "leído"
    await expect(sent).toHaveAttribute('data-status', 'read');

    // Andrés responde y Laura lo recibe sin recargar
    const reply = unique('Sí, salimos 7:30');
    await andres.page.getByLabel('Escribe un mensaje').fill(reply);
    await andres.page.getByLabel('Escribe un mensaje').press('Enter');
    await expect(laura.page.getByTestId('message').filter({ hasText: reply })).toBeVisible();

    // El servidor solo guarda texto cifrado: la API nunca devuelve el texto en claro
    const token = await laura.page.evaluate(() => localStorage.getItem('parla.token'));
    const conversationId = laura.page.url().split('/c/')[1];
    const raw = await laura.page.request.get(`/api/chats/${conversationId}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await raw.text();
    expect(body).not.toContain(text);
    expect(body).not.toContain(reply);

    // Persistencia: tras recargar, el historial sigue ahí (y se descifra de nuevo)
    await laura.page.reload();
    await expect(laura.page.getByTestId('message').filter({ hasText: reply })).toBeVisible();

    expect(laura.consoleErrors).toEqual([]);
    expect(andres.consoleErrors).toEqual([]);
    await laura.context.close();
    await andres.context.close();
  });

  test('las fotos y notas de voz de ejemplo se descifran en el navegador', async ({ page }) => {
    await login(page, 'laura');
    await openChat(page, 'Logística y despachos');
    await expect(page.getByAltText('Imagen enviada').first()).toBeVisible();
    await expect(page.getByTestId('voice-note').getByRole('button', { name: /Reproducir/ })).toBeEnabled();
  });

  test('una contraseña equivocada muestra un error claro', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('Usuario o teléfono').fill('laura');
    await page.getByLabel('Contraseña', { exact: true }).fill('Incorrecta123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Usuario, teléfono o contraseña incorrectos');
  });

  test('se puede entrar con el número de teléfono', async ({ page }) => {
    await login(page, '+57 300 123 4567');
    await expect(page.getByText('Sofía Ramírez · Colaborador')).toBeVisible();
  });
});
