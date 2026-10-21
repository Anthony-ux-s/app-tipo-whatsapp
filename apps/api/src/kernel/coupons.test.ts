import { describe, expect, it } from 'vitest';
import { assertCouponCode, assertCouponRule, couponDiscount, normalizeCouponCode, type CouponRule } from './coupons';

const base: CouponRule = {
  code: 'PARLA10', description: '10 % en tu compra', kind: 'percent', value: 10, maxDiscountCents: 1000, minSubtotalCents: 2000,
  firstOrderOnly: false, perUserLimit: 1, maxUses: null, startsAt: null, endsAt: null, active: true,
};
const now = new Date('2026-10-17T12:00:00Z');
const ctx = { subtotalCents: 5000, deliveryFeeCents: 650, uses: 0, userUses: 0, userOrders: 3, now };

describe('cupones', () => {
  it('porcentaje con tope, monto fijo y envío gratis', () => {
    expect(couponDiscount(base, ctx)).toBe(500);
    expect(couponDiscount(base, { ...ctx, subtotalCents: 50_000 })).toBe(1000); // tope S/ 10
    expect(couponDiscount({ ...base, kind: 'amount', value: 800 }, ctx)).toBe(800);
    expect(couponDiscount({ ...base, kind: 'amount', value: 9000, minSubtotalCents: 0 }, ctx)).toBe(5000); // nunca más que los productos
    expect(couponDiscount({ ...base, kind: 'free_delivery', value: 0 }, ctx)).toBe(650);
  });

  it('dice por qué no vale', () => {
    expect(() => couponDiscount({ ...base, active: false }, ctx)).toThrow('no está activo');
    expect(() => couponDiscount({ ...base, endsAt: new Date('2026-10-01') }, ctx)).toThrow('venció');
    expect(() => couponDiscount({ ...base, startsAt: new Date('2026-11-01') }, ctx)).toThrow('todavía no empieza');
    expect(() => couponDiscount({ ...base, maxUses: 5 }, { ...ctx, uses: 5 })).toThrow('agotó');
    expect(() => couponDiscount(base, { ...ctx, userUses: 1 })).toThrow('Ya usaste');
    expect(() => couponDiscount({ ...base, firstOrderOnly: true }, ctx)).toThrow('primer pedido');
    expect(couponDiscount({ ...base, firstOrderOnly: true }, { ...ctx, userOrders: 0 })).toBe(500);
    expect(() => couponDiscount(base, { ...ctx, subtotalCents: 1999 })).toThrow('desde S/ 20.00');
  });

  it('valida el código y las reglas al crearlo', () => {
    expect(normalizeCouponCode(' bien venida ')).toBe('BIENVENIDA');
    expect(() => assertCouponCode('AB')).toThrow();
    expect(() => assertCouponCode('PARLA-10')).toThrow();
    expect(() => assertCouponRule({ ...base, value: 0 })).toThrow('porcentaje');
    expect(() => assertCouponRule({ ...base, kind: 'amount', value: 0 })).toThrow('descuento');
    expect(() => assertCouponRule({ ...base, description: ' ' })).toThrow('qué ofrece');
    expect(() => assertCouponRule({ ...base, perUserLimit: 0 })).toThrow('por persona');
    expect(() => assertCouponRule({ ...base, kind: 'free_delivery', value: 0 })).not.toThrow();
  });
});
