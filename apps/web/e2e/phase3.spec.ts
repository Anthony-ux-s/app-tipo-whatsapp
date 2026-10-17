import { expect, test, type Page } from '@playwright/test';
import { openChat, openSession, unique } from './helpers';

async function messageMenu(page: Page, text: string, action: string) {
  const bubble = page.getByTestId('message-list').getByTestId('message').filter({ hasText: text }).first();
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Opciones del mensaje' }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test.describe('Fase 3: menciones, hilos y notificaciones', () => {
  test('mencionar, responder en hilo y citar un mensaje en tiempo real', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const andres = await openSession(browser, 'andres');

    // Laura menciona a Andrés eligiendo la sugerencia del @
    await openChat(laura.page, 'Andrés Rojas');
    const box = laura.page.getByLabel('Escribe un mensaje');
    await box.pressSequentially('Hola @andr');
    await expect(laura.page.getByRole('listbox', { name: 'Mencionar a alguien' })).toBeVisible();
    await box.press('Enter');
    const text = unique('¿revisas la ruta?');
    await box.pressSequentially(text);
    await box.press('Enter');
    await expect(laura.page.getByTestId('message').filter({ hasText: text }).getByTestId('mention')).toHaveText('@Andrés Rojas');

    // Andrés ve el aviso de mención en su lista y la mención resaltada
    const item = andres.page.getByTestId('chat-item').filter({ hasText: 'Laura Méndez' });
    await expect(item.getByLabel('Te mencionaron')).toBeVisible();
    await item.click();
    await expect(andres.page.getByTestId('message').filter({ hasText: text }).getByTestId('mention')).toBeVisible();

    // Andrés responde en el hilo; Laura ve el contador sin recargar y abre el hilo
    await messageMenu(andres.page, text, 'Responder en hilo');
    const threadReply = unique('Sí, la reviso en la tarde');
    const threadBox = andres.page.getByTestId('thread-panel').locator('..').getByLabel('Responder en el hilo');
    await threadBox.fill(threadReply);
    await threadBox.press('Enter');
    await expect(andres.page.getByTestId('thread-panel').getByText(threadReply)).toBeVisible();

    const root = laura.page.getByTestId('message').filter({ hasText: text });
    await expect(root.getByTestId('thread-chip')).toHaveText(/1 respuesta/);
    await root.getByTestId('thread-chip').click();
    await expect(laura.page.getByTestId('thread-panel').getByText(threadReply)).toBeVisible();

    // Respuesta citada en el chat principal
    await andres.page.getByRole('button', { name: 'Cerrar hilo' }).click();
    await messageMenu(andres.page, text, 'Responder');
    await expect(andres.page.getByTestId('reply-bar')).toContainText('Respondiendo a Laura Méndez');
    const quoted = unique('Te confirmo antes de las 5');
    await andres.page.getByLabel('Escribe un mensaje').fill(quoted);
    await andres.page.getByLabel('Escribe un mensaje').press('Enter');
    await expect(laura.page.getByTestId('message').filter({ hasText: quoted }).getByTestId('reply-quote')).toContainText(text);

    expect(laura.consoleErrors).toEqual([]);
    expect(andres.consoleErrors).toEqual([]);
    await laura.context.close();
    await andres.context.close();
  });

  test('suscripción push: alta, estado y baja contra la API real', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const token = await laura.page.evaluate(() => localStorage.getItem('parla.token'));
    const headers = { authorization: `Bearer ${token}` };
    const endpoint = `https://push.example.com/e2e-${Date.now()}`;

    const key = await laura.page.request.get('/api/push/public-key', { headers });
    expect((await key.json()).publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const before = (await (await laura.page.request.get('/api/push/status', { headers })).json()).devices;
    const sub = await laura.page.request.post('/api/push/subscriptions', { headers, data: { endpoint, keys: { p256dh: 'clave', auth: 'auth' } } });
    expect(sub.status()).toBe(201);
    expect((await (await laura.page.request.get('/api/push/status', { headers })).json()).devices).toBe(before + 1);
    const off = await laura.page.request.delete('/api/push/subscriptions', { headers, data: { endpoint } });
    expect(off.status()).toBe(204);

    // La pantalla de ajustes ofrece activar las notificaciones en este dispositivo
    await laura.page.goto('/app/ajustes/notificaciones');
    await expect(laura.page.getByRole('switch', { name: /Notificaciones push en este dispositivo/ })).toBeVisible();
    await laura.context.close();
  });
});
