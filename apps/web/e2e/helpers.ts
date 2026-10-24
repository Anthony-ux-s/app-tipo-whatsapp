import { expect, type Browser, type Page } from '@playwright/test';

export const PASSWORD = 'Parla2026!';

/**
 * GPS simulado a una cuadra de Bodega MercaYa (Miraflores): los repartidores conectados mandan su
 * ubicación y así les llegan las ofertas por cercanía.
 */
export const NEAR_STORE = { latitude: -12.1275, longitude: -77.0205 };

/** Una foto JPEG de prueba (documento, entrega o reclamo), dibujada en el navegador. */
export async function testJpeg(page: Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText('Foto de prueba', 60, 110);
    return canvas.toDataURL('image/jpeg', 0.9);
  });
  return { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** Abre un navegador aparte (otra persona) y guarda los errores de consola para revisarlos al final. */
export async function openSession(browser: Browser, identifier: string, viewport = { width: 1366, height: 860 }) {
  const context = await browser.newContext({ viewport, permissions: ['microphone', 'camera', 'geolocation'], geolocation: NEAR_STORE });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await login(page, identifier);
  return { context, page, consoleErrors };
}

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/entrar');
  await page.getByLabel('Usuario, correo o teléfono').fill(identifier);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // La lista de chats, o la bandeja vacía si la cuenta aún no tiene ninguno (p. ej. la tienda).
  // Las cuentas de soporte aterrizan en su panel de administración.
  await expect(page.getByTestId('chat-list').or(page.getByRole('heading', { name: '¿No tienes chats aún?' })).or(page.getByTestId('admin-shell'))).toBeVisible();
}

export async function openChat(page: Page, title: string) {
  await page.getByTestId('chat-item').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('conversation-title')).toHaveText(title);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Número de celular colombiano que no existe en los datos de ejemplo (distinto en cada corrida). */
export function freshLocalNumber(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  return `31${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 8)}`;
}

/**
 * Registro completo con el número verificado por SMS. En pruebas OneSignal no está configurado: el
 * código sale en pantalla («modo de prueba»). Termina en la bienvenida.
 */
export async function registerNewUser(page: Page, name: string, options: { username?: string; localNumber?: string } = {}) {
  const localNumber = options.localNumber ?? freshLocalNumber();
  await page.goto('/registro');
  await page.getByLabel('País').selectOption('CO');
  await page.getByLabel('Número de celular').fill(localNumber);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  const code = (await page.getByTestId('dev-code').locator('strong').textContent())!;
  await page.getByLabel('Código de verificación').fill(code);
  await expect(page.getByText('✓ Número verificado')).toBeVisible();
  await page.getByLabel('Tu nombre').fill(name);
  if (options.username) await page.getByLabel('Nombre de usuario (opcional)').fill(options.username);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/bienvenida/);
  return { phone: `+57${localNumber.replace(/\D/g, '')}` };
}
