import type { StoreStatus } from '@parla/types';
import { ValidationError } from './domain-error';

/** Los horarios de los negocios son de Lima (la tienda del Mercado está en Perú). */
export const BUSINESS_TIME_ZONE = 'America/Lima';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function assertHour(value: string, label: string): void {
  if (!HHMM.test(value)) throw new ValidationError(`${label}: usa el formato HH:MM (p. ej. 08:30)`);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutos desde la medianoche en Lima. */
function minutesInZone(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export interface BusinessHours {
  name: string;
  acceptingOrders: boolean;
  opensAt: string;
  closesAt: string;
  /** Solo las tiendas aprobadas reciben pedidos (si falta, se da por aprobada). */
  status?: StoreStatus;
}

/**
 * ¿Recibe pedidos ahora? Abierto si el dueño no los pausó y está dentro del horario. Un horario que
 * cierra antes de abrir (p. ej. 18:00–02:00) cruza la medianoche; abrir y cerrar a la misma hora es
 * atender las 24 horas.
 */
export function businessStatus(b: BusinessHours, now = new Date()): { open: boolean; closedMessage: string | null } {
  if (b.status === 'pending') return { open: false, closedMessage: `${b.name} todavía está en revisión.` };
  if (b.status === 'rejected' || b.status === 'suspended') return { open: false, closedMessage: `${b.name} no está disponible por ahora.` };
  if (!b.acceptingOrders) return { open: false, closedMessage: `${b.name} pausó los pedidos por ahora. Vuelve en un rato.` };
  const at = minutesInZone(now);
  const from = minutes(b.opensAt);
  const to = minutes(b.closesAt);
  const inHours = from === to || (from < to ? at >= from && at < to : at >= from || at < to);
  return inHours ? { open: true, closedMessage: null } : { open: false, closedMessage: `${b.name} está cerrada. Abre a las ${b.opensAt}.` };
}
