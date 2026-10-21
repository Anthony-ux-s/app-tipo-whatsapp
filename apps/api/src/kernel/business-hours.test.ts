import { describe, expect, it } from 'vitest';
import { ValidationError } from './domain-error';
import { assertHour, businessStatus } from './business-hours';

/** Hora de Lima (UTC−5, sin horario de verano). */
const lima = (hhmm: string) => new Date(`2026-10-17T${hhmm}:00-05:00`);
const store = { name: 'Bodega MercaYa', acceptingOrders: true, opensAt: '08:00', closesAt: '22:00' };

describe('horario de los negocios', () => {
  it('abre dentro del horario de Lima y avisa a qué hora abre cuando está cerrada', () => {
    expect(businessStatus(store, lima('08:00')).open).toBe(true);
    expect(businessStatus(store, lima('21:59')).open).toBe(true);
    expect(businessStatus(store, lima('22:00'))).toEqual({ open: false, closedMessage: 'Bodega MercaYa está cerrada. Abre a las 08:00.' });
    expect(businessStatus(store, lima('07:30')).open).toBe(false);
  });

  it('un horario nocturno cruza la medianoche y la misma hora es 24 horas', () => {
    const night = { ...store, opensAt: '18:00', closesAt: '02:00' };
    expect(businessStatus(night, lima('23:30')).open).toBe(true);
    expect(businessStatus(night, lima('01:00')).open).toBe(true);
    expect(businessStatus(night, lima('12:00')).open).toBe(false);
    expect(businessStatus({ ...store, opensAt: '00:00', closesAt: '00:00' }, lima('03:00')).open).toBe(true);
  });

  it('pausado por el dueño no recibe pedidos aunque esté en horario', () => {
    expect(businessStatus({ ...store, acceptingOrders: false }, lima('12:00')).closedMessage).toContain('pausó los pedidos');
  });

  it('valida el formato HH:MM', () => {
    expect(() => assertHour('8:00', 'Abre')).toThrow(ValidationError);
    expect(() => assertHour('24:00', 'Cierra')).toThrow(ValidationError);
    expect(() => assertHour('23:59', 'Cierra')).not.toThrow();
  });
});
