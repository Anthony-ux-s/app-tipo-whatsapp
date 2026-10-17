import { expect, test } from '@playwright/test';
import { openChat, openSession, unique } from './helpers';

test('stickers cifrados (Pali, animados y con tu frase) y efectos a pantalla completa', async ({ browser }) => {
  const camila = await openSession(browser, 'camila');
  const valentina = await openSession(browser, 'valentina');
  // Parte con los efectos activados aunque una corrida anterior se haya cortado a mitad
  const valentinaToken = await valentina.page.evaluate(() => localStorage.getItem('parla.token'));
  await valentina.page.request.patch('/api/auth/me', {
    headers: { authorization: `Bearer ${valentinaToken}` },
    data: { preferences: { chatEffects: true } },
  });
  await valentina.page.reload();
  await openChat(camila.page, 'Valentina Castro');
  await openChat(valentina.page, 'Camila Torres');

  // Camila abre el panel y envía a Pali celebrando: a los dos les cae confeti
  await camila.page.getByRole('button', { name: 'Emojis y stickers' }).click();
  const picker = camila.page.getByTestId('sticker-picker');
  await picker.getByRole('tab', { name: 'Pali' }).click();
  await picker.getByTestId('sticker-pali-fiesta').click();
  await expect(camila.page.getByTestId('chat-effect')).toHaveAttribute('data-effect', 'confetti');

  const received = valentina.page.locator('[data-testid="message"][data-kind="sticker"]').last();
  await expect(received.getByRole('img', { name: 'Pali: ¡A celebrar!' })).toBeVisible();
  await expect(valentina.page.getByTestId('chat-effect')).toHaveAttribute('data-effect', 'confetti');
  await expect(valentina.page.getByTestId('chat-item').filter({ hasText: 'Camila Torres' })).toContainText('Sticker «¡A celebrar!»');

  // Emoji animado
  await picker.getByRole('tab', { name: 'Animados' }).click();
  await picker.getByRole('button', { name: 'Enviar sticker 👍' }).click();
  await expect(valentina.page.locator('[data-testid="message"][data-kind="sticker"]').last().getByRole('img', { name: 'Sticker 👍' })).toBeVisible();

  // Sticker con su propia frase
  const phrase = unique('Ya llegué');
  await picker.getByRole('tab', { name: 'Tu frase' }).click();
  await picker.getByLabel('Frase del sticker').fill(phrase);
  await picker.getByRole('radio', { name: 'Rosa' }).click();
  await picker.getByRole('button', { name: 'Enviar sticker con tu frase' }).click();
  await expect(valentina.page.locator('[data-testid="message"][data-kind="sticker"]').last()).toContainText(phrase);

  // El servidor no sabe qué sticker ni qué frase: viajan cifrados
  const token = await camila.page.evaluate(() => localStorage.getItem('parla.token'));
  const conversationId = camila.page.url().split('/c/')[1];
  const raw = await camila.page.request.get(`/api/chats/${conversationId}/messages`, { headers: { authorization: `Bearer ${token}` } });
  const body = await raw.text();
  expect(body).toContain('"kind":"sticker"');
  expect(body).not.toContain('fiesta');
  expect(body).not.toContain(phrase);

  // Efecto con texto: «te quiero» trae corazones a quien lo recibe, y se puede repetir
  await camila.page.keyboard.press('Escape');
  await camila.page.getByLabel('Escribe un mensaje').fill(unique('Te quiero mucho, amigo'));
  await camila.page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(valentina.page.getByTestId('chat-effect')).toHaveAttribute('data-effect', 'hearts');
  await expect(valentina.page.getByTestId('chat-effect')).toBeHidden({ timeout: 8000 });
  await valentina.page.getByRole('button', { name: 'Repetir efecto' }).last().click();
  await expect(valentina.page.getByTestId('chat-effect')).toHaveAttribute('data-effect', 'hearts');

  // Quien no quiere efectos los apaga en Ajustes → Chats
  await valentina.page.goto('/app/ajustes/chats');
  await valentina.page.getByRole('switch', { name: /Efectos en pantalla/ }).click();
  await expect(valentina.page.getByRole('switch', { name: /Efectos en pantalla/ })).toHaveAttribute('aria-checked', 'false');
  await valentina.page.goto('/app');
  await openChat(valentina.page, 'Camila Torres');
  const congrats = unique('¡Felicidades!');
  await camila.page.getByLabel('Escribe un mensaje').fill(congrats);
  await camila.page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(valentina.page.getByTestId('message').filter({ hasText: congrats })).toBeVisible();
  await expect(valentina.page.getByTestId('chat-effect')).toHaveCount(0);
  await valentina.page.goto('/app/ajustes/chats');
  await valentina.page.getByRole('switch', { name: /Efectos en pantalla/ }).click();
  await expect(valentina.page.getByRole('switch', { name: /Efectos en pantalla/ })).toHaveAttribute('aria-checked', 'true');

  expect(camila.consoleErrors).toEqual([]);
  expect(valentina.consoleErrors).toEqual([]);
});
