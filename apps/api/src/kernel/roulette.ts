import type { CustomerSegment, RouletteCampaignInput, RoulettePrize } from '@parla/types';
import { randomInt } from 'node:crypto';
import { SEGMENT_ORDER } from './customer-segments';
import { ValidationError } from './domain-error';

export const MIN_PRIZES = 4;
export const MAX_PRIZES = 12;
export const CAMPAIGN_KINDS = ['roulette', 'scratch', 'box', 'flash'];
/** Compra de referencia para estimar lo que cuesta cada giro. */
export const REFERENCE_BASKET_CENTS = 5_000;
const MAX_WEIGHT = 1_000;
const PRIZE_KINDS = ['none', 'percent', 'amount', 'free_delivery'];

/** Validaciones al guardar una ruleta (la hace soporte): que la rueda tenga sentido y los premios sean válidos. */
export function assertRoulette(c: RouletteCampaignInput): void {
  if (!c.name.trim()) throw new ValidationError('Ponle un nombre a la ruleta (solo lo ves tú)');
  if (!c.title.trim()) throw new ValidationError('Escribe el titular que verá el cliente');
  if (c.title.length > 40 || c.subtitle.length > 100) throw new ValidationError('El titular lleva hasta 40 letras y el subtítulo hasta 100');
  if (!SEGMENT_ORDER.includes(c.segment)) throw new ValidationError('Elige a qué clientes les sale');
  if (!Number.isInteger(c.cooldownDays) || c.cooldownDays < 1 || c.cooldownDays > 365) throw new ValidationError('Cada cuántos días puede girar: de 1 a 365');
  if (!CAMPAIGN_KINDS.includes(c.kind)) throw new ValidationError('Elige la estrategia: ruleta, rasca y gana, cofre sorpresa u oferta relámpago');
  if (c.kind === 'roulette' && (c.prizes.length < MIN_PRIZES || c.prizes.length > MAX_PRIZES)) throw new ValidationError(`La rueda lleva de ${MIN_PRIZES} a ${MAX_PRIZES} premios`);
  if ((c.kind === 'scratch' || c.kind === 'box') && (c.prizes.length < 2 || c.prizes.length > MAX_PRIZES)) throw new ValidationError(`Esta estrategia lleva de 2 a ${MAX_PRIZES} premios posibles`);
  if (c.kind === 'flash') {
    if (c.prizes.length !== 1 || c.prizes[0].kind === 'none') throw new ValidationError('La oferta relámpago lleva un solo premio, con descuento');
    if (!c.endsAt) throw new ValidationError('La oferta relámpago necesita una fecha y hora de fin');
  }
  const from = c.startsAt ? Date.parse(c.startsAt) : null;
  const to = c.endsAt ? Date.parse(c.endsAt) : null;
  if ((from !== null && Number.isNaN(from)) || (to !== null && Number.isNaN(to))) throw new ValidationError('Revisa las fechas de inicio y fin');
  if (from !== null && to !== null && to <= from) throw new ValidationError('La fecha de fin debe ser después de la de inicio');
  const ids = new Set<string>();
  for (const p of c.prizes) {
    if (!p.id || ids.has(p.id)) throw new ValidationError('Cada premio necesita un identificador distinto');
    ids.add(p.id);
    if (!p.label.trim() || p.label.length > 24) throw new ValidationError('El texto de cada premio lleva de 1 a 24 letras (se lee dentro de la rueda)');
    if (!PRIZE_KINDS.includes(p.kind)) throw new ValidationError(`«${p.label}»: elige el tipo de premio`);
    if (!Number.isInteger(p.weight) || p.weight < 1 || p.weight > MAX_WEIGHT) throw new ValidationError(`«${p.label}»: la probabilidad va de 1 a ${MAX_WEIGHT}`);
    if (p.kind === 'percent' && (!Number.isInteger(p.value) || p.value < 1 || p.value > 100)) throw new ValidationError(`«${p.label}»: el porcentaje va de 1 a 100`);
    if (p.kind === 'amount' && (!Number.isInteger(p.value) || p.value < 1 || p.value > 100_000)) throw new ValidationError(`«${p.label}»: el descuento va de S/ 0.01 a S/ 1000`);
    if (p.kind !== 'none') {
      if (!Number.isInteger(p.validDays) || p.validDays < 1 || p.validDays > 90) throw new ValidationError(`«${p.label}»: el cupón dura de 1 a 90 días`);
      if (!Number.isInteger(p.minSubtotalCents) || p.minSubtotalCents < 0) throw new ValidationError(`«${p.label}»: la compra mínima no puede ser negativa`);
      if (p.maxDiscountCents !== null && (!Number.isInteger(p.maxDiscountCents) || p.maxDiscountCents < 1)) throw new ValidationError(`«${p.label}»: el tope debe ser mayor que 0`);
    }
  }
}

export const totalWeight = (prizes: RoulettePrize[]): number => prizes.reduce((sum, p) => sum + p.weight, 0);

/** Elige el premio al azar según los pesos. `roll` permite probarlo con un número fijo (0 a total-1). */
export function pickPrize(prizes: RoulettePrize[], roll = randomInt(totalWeight(prizes))): { prize: RoulettePrize; index: number } {
  let rest = roll;
  for (const [index, prize] of prizes.entries()) {
    if (rest < prize.weight) return { prize, index };
    rest -= prize.weight;
  }
  return { prize: prizes[prizes.length - 1], index: prizes.length - 1 };
}

/** Cuánto descuenta un premio en la compra de referencia (céntimos). */
function prizeCost(p: RoulettePrize): number {
  switch (p.kind) {
    case 'none':
      return 0;
    case 'amount':
      return Math.min(p.value, REFERENCE_BASKET_CENTS);
    case 'free_delivery':
      return 650;
    case 'percent': {
      const raw = Math.round((REFERENCE_BASKET_CENTS * p.value) / 100);
      return Math.min(raw, p.maxDiscountCents ?? raw);
    }
  }
}

/** Costo promedio de un giro, en % de la compra de referencia (si todos los premios se usaran). */
export function expectedCostPercent(prizes: RoulettePrize[]): number {
  const total = totalWeight(prizes);
  if (!total) return 0;
  const cost = prizes.reduce((sum, p) => sum + (p.weight / total) * prizeCost(p), 0);
  return Math.round((cost / REFERENCE_BASKET_CENTS) * 1000) / 10;
}

/** Período de espera en el que cae `now`: dos giros en el mismo período no se permiten (lo hace valer la base). */
export function spinSlot(now: Date, cooldownDays: number): number {
  return Math.floor(now.getTime() / 86_400_000 / cooldownDays);
}

export function describePrize(p: RoulettePrize): string {
  const min = p.minSubtotalCents > 0 ? ` en compras desde S/ ${(p.minSubtotalCents / 100).toFixed(2)}` : '';
  if (p.kind === 'free_delivery') return `Envío gratis${min}`;
  if (p.kind === 'amount') return `S/ ${(p.value / 100).toFixed(2)} de descuento${min}`;
  return `${p.value} % de descuento${min}`;
}

export const isSegment = (v: string): v is CustomerSegment => (SEGMENT_ORDER as string[]).includes(v);
