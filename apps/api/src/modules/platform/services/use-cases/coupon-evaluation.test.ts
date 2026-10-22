import { describe, expect, it } from 'vitest';
import { InMemoryCoupons, InMemoryOrdersRepository } from '../../../../testing/in-memory.fakes';
import { evaluateCoupon } from './coupon-evaluation';

describe('cupón personal de la ruleta', () => {
  async function setup() {
    const coupons = new InMemoryCoupons(new InMemoryOrdersRepository());
    await coupons.create({
      code: 'RULAAAA1111',
      description: '10 % de descuento',
      kind: 'percent',
      value: 10,
      maxDiscountCents: null,
      minSubtotalCents: 0,
      firstOrderOnly: false,
      perUserLimit: 1,
      maxUses: 1,
      endsAt: null,
      ownerUserId: 'laura',
    });
    return coupons;
  }

  it('lo puede usar quien lo ganó', async () => {
    const coupons = await setup();
    const applied = await evaluateCoupon(coupons, { code: 'rulaaaa1111', userId: 'laura', subtotalCents: 4000, deliveryFeeCents: 600 });
    expect(applied.discountCents).toBe(400);
  });

  it('para cualquier otra persona el cupón no existe', async () => {
    const coupons = await setup();
    await expect(evaluateCoupon(coupons, { code: 'RULAAAA1111', userId: 'camila', subtotalCents: 4000, deliveryFeeCents: 600 })).rejects.toThrow('Ese cupón no existe');
  });
});
