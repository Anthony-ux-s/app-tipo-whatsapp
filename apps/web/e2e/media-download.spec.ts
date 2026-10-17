import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openChat, openSession } from './helpers';

// PNG de 1×1 válido.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const IMAGE_MAGIC = [Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('RIFF')];

const isImage = (bytes: Buffer) => IMAGE_MAGIC.some((magic) => bytes.subarray(0, magic.length).equals(magic));

test('quien recibe una foto la descarga descifrada, desde el visor y desde el menú del mensaje', async ({ browser }) => {
  const laura = await openSession(browser, 'laura');
  const andres = await openSession(browser, 'andres');

  await openChat(laura.page, 'Andrés Rojas');
  await laura.page.getByTestId('file-input').setInputFiles({ name: 'ruta.png', mimeType: 'image/png', buffer: PHOTO });
  await laura.page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(laura.page.locator('[data-testid="message"][data-kind="image"]').last()).toHaveAttribute('data-status', /sent|delivered|read/);

  await openChat(andres.page, 'Laura Méndez');
  const photo = andres.page.locator('[data-testid="message"][data-kind="image"]').last();
  await expect(photo.getByRole('button', { name: 'Ver imagen' })).toBeVisible();

  // Desde el visor a pantalla completa
  await photo.getByRole('button', { name: 'Ver imagen' }).click();
  const [fromViewer] = await Promise.all([andres.page.waitForEvent('download'), andres.page.getByRole('link', { name: 'Descargar imagen' }).click()]);
  expect(fromViewer.suggestedFilename()).toMatch(/^Parla-IMG-\d{8}-\d{6}\.(jpg|png|webp)$/);
  expect(isImage(await readFile((await fromViewer.path())!))).toBe(true);
  await andres.page.getByRole('button', { name: 'Cerrar imagen' }).click();

  // Desde el menú del mensaje
  await photo.hover();
  await photo.getByRole('button', { name: 'Opciones del mensaje' }).click();
  const [fromMenu] = await Promise.all([andres.page.waitForEvent('download'), andres.page.getByRole('menuitem', { name: 'Descargar' }).click()]);
  expect(fromMenu.suggestedFilename()).toBe(fromViewer.suggestedFilename());
  expect(isImage(await readFile((await fromMenu.path())!))).toBe(true);
});
