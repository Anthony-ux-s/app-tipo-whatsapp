import { describe, expect, it } from 'vitest';
import { aggregateDeliveryStatus, isForwardTransition } from './delivery-status';
import { ConflictError, ForbiddenError, ValidationError } from './domain-error';
import { assertPasswordStrength, parseIdentifier } from './identifier';
import { assertCanCreateGroup, assertIsAdmin, assertKeepsAnAdmin } from './workspace-permissions';
import { generateInviteCode } from './invite-code';

const at = new Date('2026-10-01T10:00:00Z');

describe('estado de entrega de un mensaje', () => {
  it('queda "enviado" mientras algún destinatario no lo recibe', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: null }, { deliveredAt: null, readAt: null }])).toBe('sent');
  });

  it('pasa a "entregado" cuando llegó a todos', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: at }, { deliveredAt: at, readAt: null }])).toBe('delivered');
  });

  it('pasa a "leído" solo cuando todos lo leyeron (en grupos manda el más atrasado)', () => {
    expect(aggregateDeliveryStatus([{ deliveredAt: at, readAt: at }, { deliveredAt: at, readAt: at }])).toBe('read');
  });

  it('nunca retrocede', () => {
    expect(isForwardTransition('sent', 'delivered')).toBe(true);
    expect(isForwardTransition('delivered', 'read')).toBe(true);
    expect(isForwardTransition('read', 'delivered')).toBe(false);
    expect(isForwardTransition('delivered', 'delivered')).toBe(false);
  });
});

describe('identificador de inicio de sesión', () => {
  it('reconoce teléfonos con espacios y sin el signo +', () => {
    expect(parseIdentifier('+57 300 123 4567')).toEqual({ phone: '+573001234567' });
    expect(parseIdentifier('573001234567')).toEqual({ phone: '+573001234567' });
  });

  it('reconoce nombres de usuario sin importar la @ ni las mayúsculas', () => {
    expect(parseIdentifier('@Laura')).toEqual({ username: 'laura' });
  });

  it('rechaza formatos inválidos', () => {
    expect(() => parseIdentifier('+12')).toThrow(ValidationError);
    expect(() => parseIdentifier('a b')).toThrow(ValidationError);
  });

  it('exige contraseñas de 8+ caracteres con letras y números', () => {
    expect(() => assertPasswordStrength('corta1')).toThrow(ValidationError);
    expect(() => assertPasswordStrength('soloLetrasLargas')).toThrow(ValidationError);
    expect(() => assertPasswordStrength('Parla2026!')).not.toThrow();
  });
});

describe('permisos del espacio de trabajo', () => {
  it('solo un administrador administra', () => {
    expect(() => assertIsAdmin('member')).toThrow(ForbiddenError);
    expect(() => assertIsAdmin('admin')).not.toThrow();
  });

  it('los colaboradores crean grupos solo si el espacio lo permite', () => {
    expect(() => assertCanCreateGroup('member', false)).toThrow(ForbiddenError);
    expect(() => assertCanCreateGroup('member', true)).not.toThrow();
    expect(() => assertCanCreateGroup('admin', false)).not.toThrow();
    expect(() => assertCanCreateGroup(null, true)).toThrow(ForbiddenError);
  });

  it('el espacio nunca se queda sin administradores', () => {
    expect(() => assertKeepsAnAdmin(1, 'admin', 'member')).toThrow(ConflictError);
    expect(() => assertKeepsAnAdmin(1, 'admin', 'removed')).toThrow(ConflictError);
    expect(() => assertKeepsAnAdmin(2, 'admin', 'member')).not.toThrow();
    expect(() => assertKeepsAnAdmin(1, 'member', 'removed')).not.toThrow();
  });

  it('los códigos de invitación son legibles y distintos', () => {
    const a = generateInviteCode();
    expect(a).toMatch(/^[a-zA-Z2-9]{10}$/);
    expect(a).not.toMatch(/[01lIoO]/);
    expect(generateInviteCode()).not.toBe(a);
  });
});
