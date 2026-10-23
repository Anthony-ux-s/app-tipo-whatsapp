import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env.validation';
import { BrevoSender } from './brevo-sender.adapter';
import { ComposedSender } from './composed-sender.adapter';
import { DevConsoleSender } from './dev-console-sender.adapter';
import { DeliveryFailedError } from './verification-sender.port';

const env = { brevo: { apiKey: 'xkeysib-secreta', senderEmail: 'no-responder@kronito.com', senderName: 'Parla' } } as AppEnv;

afterEach(() => vi.unstubAllGlobals());

describe('envío de correos con Brevo', () => {
  it('manda el correo a la API de Brevo con la clave, el remitente y las dos versiones', async () => {
    const fetchMock = vi.fn(async () => new Response('{"messageId":"<1@brevo>"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await new BrevoSender(env).sendEmail('rosa@correo.com', 'Tu código', '<p>123456</p>', 'Tu código 123456');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-secreta');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'Parla', email: 'no-responder@kronito.com' },
      to: [{ email: 'rosa@correo.com' }],
      subject: 'Tu código',
      htmlContent: '<p>123456</p>',
      textContent: 'Tu código 123456',
    });
  });

  it('si Brevo rechaza el envío (clave o remitente malos), falla con un error de entrega sin filtrar la clave', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })));
    const error = await new BrevoSender(env).sendEmail('rosa@correo.com', 'x', '<p>x</p>').catch((e) => e);
    expect(error).toBeInstanceOf(DeliveryFailedError);
    expect(String(error.message)).not.toContain('xkeysib');
  });

  it('si no responde, también es un error de entrega', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('sin red'))));
    await expect(new BrevoSender(env).sendEmail('rosa@correo.com', 'x', '<p>x</p>')).rejects.toBeInstanceOf(DeliveryFailedError);
  });

  it('Brevo no manda SMS', async () => {
    await expect(new BrevoSender(env).sendSms()).rejects.toBeInstanceOf(DeliveryFailedError);
  });

  it('combinado: el correo sale por Brevo y el modo de prueba se decide por canal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 201 })));
    const composed = new ComposedSender(new DevConsoleSender(), new BrevoSender(env));
    expect(composed.isDev('sms')).toBe(true);
    expect(composed.isDev('email')).toBe(false);
    await expect(composed.sendEmail('rosa@correo.com', 'x', '<p>x</p>')).resolves.toBeUndefined();
  });
});
