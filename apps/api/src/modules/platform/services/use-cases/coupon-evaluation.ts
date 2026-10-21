import type { AppliedCoupon, InternalCouponQuote } from '@parla/types';
import { couponDiscount, normalizeCouponCode } from '../../../../kernel/coupons';
import { NotFoundError } from '../../../../kernel/domain-error';
import type { CouponsRepository } from '../coupons.repository';

/**
 * ¿Vale el cupón para esta persona y este carrito? Devuelve el descuento, o un 409 con el motivo
 * (venció, ya lo usaste, compra mínima…). Lo usan la cotización y la creación del pedido.
 */
export async function evaluateCoupon(coupons: CouponsRepository, input: InternalCouponQuote, now = new Date()): Promise<AppliedCoupon> {
  const code = normalizeCouponCode(input.code);
  const coupon = code ? await coupons.findByCode(code) : null;
  if (!coupon) throw new NotFoundError('Ese cupón no existe');
  const [uses, userUses, userOrders] = await Promise.all([
    coupon.maxUses !== null ? coupons.countUses(code) : Promise.resolve(0),
    coupons.countUses(code, input.userId),
    coupon.firstOrderOnly ? coupons.countLiveOrders(input.userId) : Promise.resolve(0),
  ]);
  const discountCents = couponDiscount(coupon, { subtotalCents: input.subtotalCents, deliveryFeeCents: input.deliveryFeeCents, uses, userUses, userOrders, now });
  return { code, description: coupon.description, kind: coupon.kind, discountCents };
}

