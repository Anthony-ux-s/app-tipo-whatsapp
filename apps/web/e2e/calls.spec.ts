import { expect, test, type Page } from '@playwright/test';
import { openChat, openSession } from './helpers';

/** Espera a que el video remoto tenga imagen real (la cámara simulada de Chromium). */
async function expectRemoteVideoPlaying(page: Page) {
  const video = page.getByTestId('remote-video').first();
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
}

test.describe('Llamadas de voz y video', () => {
  test('videollamada: Laura llama, Andrés contesta, ambos se ven y al colgar queda el registro en el chat', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const andres = await openSession(browser, 'andres');

    await openChat(laura.page, 'Andrés Rojas');
    await laura.page.getByRole('button', { name: 'Videollamada' }).click();
    await expect(laura.page.getByTestId('call-status')).toHaveText('Llamando…');
    await expect(laura.page.getByTestId('local-video')).toBeVisible();

    // A Andrés le suena la llamada y contesta
    await expect(andres.page.getByTestId('incoming-title')).toHaveText('Laura Méndez');
    await andres.page.getByTestId('accept-call').click();

    // Los dos quedan conectados y ven el video del otro (WebRTC P2P)
    await expect(laura.page.getByTestId('call-screen')).toHaveAttribute('data-phase', 'active', { timeout: 20_000 });
    await expect(andres.page.getByTestId('call-screen')).toHaveAttribute('data-phase', 'active', { timeout: 20_000 });
    await expectRemoteVideoPlaying(laura.page);
    await expectRemoteVideoPlaying(andres.page);
    await expect(laura.page.getByTestId('call-status')).toHaveText(/^\d+:\d{2}$/);

    // Silenciar y apagar la cámara
    await laura.page.getByTestId('toggle-mute').click();
    await expect(laura.page.getByRole('button', { name: 'Activar micrófono' })).toBeVisible();
    await laura.page.getByTestId('toggle-camera').click();
    await expect(laura.page.getByRole('button', { name: 'Encender cámara' })).toBeVisible();

    // Andrés cuelga: termina para los dos y queda el aviso con la duración
    await andres.page.waitForTimeout(1500);
    await andres.page.getByTestId('hang-up').click();
    await expect(laura.page.getByTestId('call-screen')).toBeHidden({ timeout: 10_000 });
    await expect(laura.page.getByText(/🎥 Videollamada · \d+:\d{2}/).last()).toBeVisible();

    expect(laura.consoleErrors).toEqual([]);
    expect(andres.consoleErrors).toEqual([]);
    await laura.context.close();
    await andres.context.close();
  });

  test('llamada de voz rechazada: queda como perdida en el chat', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const andres = await openSession(browser, 'andres');

    await openChat(laura.page, 'Andrés Rojas');
    await laura.page.getByRole('button', { name: 'Llamada de voz' }).click();
    await expect(andres.page.getByTestId('incoming-title')).toBeVisible();
    await andres.page.getByTestId('decline-call').click();
    await expect(andres.page.getByTestId('incoming-title')).toBeHidden();

    await expect(laura.page.getByTestId('call-status')).toHaveText('Llamada rechazada');
    await expect(laura.page.getByTestId('call-screen')).toBeHidden({ timeout: 10_000 });
    await expect(laura.page.getByText('📞 Llamada de voz perdida').last()).toBeVisible();

    await laura.context.close();
    await andres.context.close();
  });
});
