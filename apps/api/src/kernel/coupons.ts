import type { CouponKind } from '@parla/types';
import { ConflictError, ValidationError } from './domain-error';
import { formatSoles } from './order-rules';

/** Un cupón tal como lo guarda el core. */
export interface CouponRule {
  code: string;
  description: string;
  kind: CouponKind;
  /** Porcentaje (1 a 100) o céntimos de descuento; 0 en envío gratis. */
  value: number;
  maxDiscountCents: number | null;
  minSubtotalCents: number;
  firstOrderOnly: boolean;
  perUserLimit: number;
  maxUses: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

/** Con qué se evalúa: el carrito y cuánto lo usó ya la persona (y todos). */
export interface CouponContext {
  subtotalCents: number;
  deliveryFeeCents: number;
  /** Usos del cupón en pedidos vivos o entregados. */
  uses: number;
  userUses: number;
  /** Pedidos anteriores de la persona que no se cancelaron ni vencieron. */
  userOrders: number;
  now: Date;
}

const CODE = /^[A-Z0-9]{3,20}$/;

/** Mayúsculas y sin espacios: «bienvenida » → «BIENVENIDA». */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function assertCouponCode(code: string): void {
  if (!CODE.test(code)) throw new ValidationError('El código del cupón lleva de 3 a 20 letras o números, sin espacios');
}

/**
 * Cuánto descuenta el cupón en este carrito, o por qué no vale. El descuento nunca supera lo que se
 * descuenta (los productos, o el delivery en envío gratis) ni deja el total en negativo; la propina
 * no se descuenta: va completa al repartidor.
 */
export function couponDiscount(c: CouponRule, ctx: CouponContext): number {
  const invalid = (message: string) => new ConflictError(message);
  if (!c.active) throw invalid('Este cupón ya no está activo');
  if (c.startsAt && ctx.now < c.startsAt) throw invalid('Este cupón todavía no empieza');
  if (c.endsAt && ctx.now > c.endsAt) throw invalid('Este cupón ya venció');
  if (c.maxUses !== null && ctx.uses >= c.maxUses) throw invalid('Este cupón ya se agotó');
  if (ctx.userUses >= c.perUserLimit) throw invalid(c.perUserLimit === 1 ? 'Ya usaste este cupón' : `Ya usaste este cupón ${c.perUserLimit} veces`);
  if (c.firstOrderOnly && ctx.userOrders > 0) throw invalid('Este cupón es solo para tu primer pedido');
  if (ctx.subtotalCents < c.minSubtotalCents) throw invalid(`Este cupón es para compras desde ${formatSoles(c.minSubtotalCents)} en productos`);

  switch (c.kind) {
    case 'free_delivery':
      return ctx.deliveryFeeCents;
    case 'amount':
      return Math.min(c.value, ctx.subtotalCents);
    case 'percent': {
      const raw = Math.round((ctx.subtotalCents * c.value) / 100);
      return Math.min(raw, c.maxDiscountCents ?? raw, ctx.subtotalCents);
    }
  }
}

/** Validaciones al crear un cupón (lo hace soporte). */
export function assertCouponRule(c: Pick<CouponRule, 'kind' | 'value' | 'maxDiscountCents' | 'minSubtotalCents' | 'perUserLimit' | 'maxUses' | 'description'>): void {
  if (!['percent', 'amount', 'free_delivery'].includes(c.kind)) throw new ValidationError('Elige el tipo de cupón');
  if (!c.description.trim()) throw new ValidationError('Escribe qué ofrece el cupón (lo ve el cliente)');
  if (c.kind === 'percent' && (!Number.isInteger(c.value) || c.value < 1 || c.value > 100)) throw new ValidationError('El porcentaje va de 1 a 100');
  if (c.kind === 'amount' && (!Number.isInteger(c.value) || c.value < 1 || c.value > 100_000)) throw new ValidationError('El descuento va de S/ 0.01 a S/ 1000');
  if (c.maxDiscountCents !== null && (!Number.isInteger(c.maxDiscountCents) || c.maxDiscountCents < 1)) throw new ValidationError('El tope del descuento debe ser mayor que 0');
  if (!Number.isInteger(c.minSubtotalCents) || c.minSubtotalCents < 0) throw new ValidationError('La compra mínima no puede ser negativa');
  if (!Number.isInteger(c.perUserLimit) || c.perUserLimit < 1 || c.perUserLimit > 100) throw new ValidationError('Usos por persona: de 1 a 100');
  if (c.maxUses !== null && (!Number.isInteger(c.maxUses) || c.maxUses < 1)) throw new ValidationError('El límite total de usos debe ser mayor que 0');
}
