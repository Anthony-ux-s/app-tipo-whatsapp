import { expect, test, type Page } from '@playwright/test';
import { openChat, openSession, unique } from './helpers';

async function messageMenu(page: Page, text: string, action: string) {
  const bubble = page.getByTestId('message-list').getByTestId('message').filter({ hasText: text }).first();
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Opciones del mensaje' }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test.describe('Fase 3: menciones, hilos, tareas y notificaciones', () => {
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

  test('convertir un mensaje en tarea, asignarla y completarla desde "Mis tareas"', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const andres = await openSession(browser, 'andres');
    const text = unique('Enviar cotización a los hoteles');

    await openChat(laura.page, 'Logística y despachos');
    await laura.page.getByLabel('Escribe un mensaje').fill(text);
    await laura.page.getByLabel('Escribe un mensaje').press('Enter');
    await expect(laura.page.getByTestId('message').filter({ hasText: text })).toHaveAttribute('data-status', /sent|delivered|read/);

    await messageMenu(laura.page, text, 'Convertir en tarea');
    await expect(laura.page.getByPlaceholder('ej. Enviar la cotización a los hoteles')).toHaveValue(text);
    await laura.page.getByLabel('Responsable').selectOption({ label: 'Andrés Rojas' });
    const tomorrow = new Date(Date.now() + 86_400_000);
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    await laura.page.getByLabel('Fecha límite').fill(iso);
    await laura.page.getByRole('button', { name: 'Crear tarea' }).click();
    await expect(laura.page.getByText('Tarea creada y compartida en el chat')).toBeVisible();

    const lauraCard = laura.page.getByTestId('message-list').getByTestId('task-card').filter({ hasText: text });
    await expect(lauraCard).toHaveAttribute('data-done', 'false');

    // Andrés la encuentra en "Mis tareas" (título descifrado en su navegador) y la completa
    await andres.page.goto(andres.page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/tareas'));
    const mine = andres.page.getByTestId('my-tasks').getByTestId('task-card').filter({ hasText: text });
    await expect(mine).toContainText('Mañana');
    await mine.getByRole('checkbox').click();
    await expect(mine).toHaveCount(0); // sale de "Asignadas a mí"
    await andres.page.getByRole('tab', { name: 'Hechas' }).click();
    await expect(andres.page.getByTestId('my-tasks').getByTestId('task-card').filter({ hasText: text })).toHaveAttribute('data-done', 'true');

    // Laura lo ve completado en el chat sin recargar
    await expect(lauraCard).toHaveAttribute('data-done', 'true');

    expect(laura.consoleErrors).toEqual([]);
    expect(andres.consoleErrors).toEqual([]);
    await laura.context.close();
    await andres.context.close();
  });

  test('un colaborador no puede completar la tarea de otra persona', async ({ browser }) => {
    const sofia = await openSession(browser, '+573001234567');
    await openChat(sofia.page, 'Logística y despachos');
    await sofia.page.getByRole('button', { name: 'Tareas del chat' }).click();
    // "Cambiar el lote de bolsas" la creó Andrés para sí mismo: Sofía no puede marcarla
    const card = sofia.page.getByTestId('open-tasks').getByTestId('task-card').filter({ hasText: 'Cambiar el lote de bolsas' });
    await expect(card.getByRole('checkbox')).toBeDisabled();
    await sofia.context.close();
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
    await laura.page.goto(laura.page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/ajustes'));
    await expect(laura.page.getByRole('switch', { name: /Notificaciones push en este dispositivo/ })).toBeVisible();
    await laura.context.close();
  });
});
