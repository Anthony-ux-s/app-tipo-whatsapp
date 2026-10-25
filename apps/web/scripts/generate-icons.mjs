// Genera los íconos PNG de la PWA a partir del logo SVG (usa el Chromium de Playwright).
//   npm run icons -w @parla/web
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
await mkdir(out, { recursive: true });

const FRONT = 'M11 15h16a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H17l-8 6v-6.4A8 8 0 0 1 3 33V23a8 8 0 0 1 8-8z';
// Sin contorno de color: el borde entre las burbujas es un recorte transparente (igual que el logo de la app).
const mark = (size, padding, background) => `
<html><body style="margin:0;background:${background}">
<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${background}">
<svg viewBox="0 0 48 48" width="${size - padding * 2}" height="${size - padding * 2}">
  <defs><mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><rect width="48" height="48" fill="#fff"/><path d="${FRONT}" fill="#000" stroke="#000" stroke-width="5" stroke-linejoin="round"/></mask></defs>
  <path d="M20 5h17a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-1v6l-7-6h-9a8 8 0 0 1-8-8V13a8 8 0 0 1 8-8z" fill="#34d399" mask="url(#cut)"/>
  <path d="${FRONT}" fill="#009d71"/>
  <path d="M12.5 28.5l4.5 4.5 8.5-9" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const icons = [
  { file: 'icon-192.png', size: 192, padding: 18, background: 'transparent' },
  { file: 'icon-512.png', size: 512, padding: 48, background: 'transparent' },
  // iOS no admite transparencia en el ícono de inicio: lleva fondo blanco.
  { file: 'apple-touch-icon.png', size: 180, padding: 22, background: '#ffffff' },
  { file: 'icon-maskable-512.png', size: 512, padding: 110, background: '#ecfdf5' },
];
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(mark(icon.size, icon.padding, icon.background));
  await page.screenshot({ path: join(out, icon.file), omitBackground: icon.background === 'transparent' });
  console.log(`public/icons/${icon.file}`);
}
await browser.close();
