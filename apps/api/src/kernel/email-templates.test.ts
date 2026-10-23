import { describe, expect, it } from 'vitest';
import { renderEmail, type EmailKind } from './email-templates';

describe('plantillas de correo', () => {
  const codeKinds: EmailKind[] = ['register', 'confirm_email', 'reset_password'];

  it.each(codeKinds)('«%s»: el código va en el asunto, en el cuerpo y en el texto plano', (kind) => {
    const mail = renderEmail(kind, { code: '482913', minutes: 10, webUrl: 'https://www.kronito.com' });
    expect(mail.subject).toContain('482913');
    expect(mail.html).toContain('482913');
    expect(mail.html).toContain('10 minutos');
    expect(mail.text).toContain('482913');
    expect(mail.text).not.toMatch(/<[a-z]+/i);
    expect(mail.html).toContain('<!doctype html>');
    expect(mail.html).toContain('parla');
  });

  it('cada tipo dice lo suyo', () => {
    expect(renderEmail('register', { code: '111111' }).html).toContain('Estás creando tu cuenta');
    expect(renderEmail('confirm_email', { code: '111111' }).html).toContain('recuperar tu cuenta');
    expect(renderEmail('reset_password', { code: '111111' }).subject).toContain('restablecer');
  });

  it('la bienvenida saluda por el primer nombre y lleva el enlace a la app', () => {
    const mail = renderEmail('welcome', { name: 'Rosa María Pérez', webUrl: 'https://www.kronito.com/' });
    expect(mail.subject).toBe('¡Bienvenido a Parla, Rosa!');
    expect(mail.html).toContain('https://www.kronito.com/app');
    expect(mail.text).toContain('https://www.kronito.com/app');
  });

  it('no deja pasar HTML en el nombre (nadie inyecta código en el correo)', () => {
    const mail = renderEmail('welcome', { name: '<script>alert(1)</script>' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
