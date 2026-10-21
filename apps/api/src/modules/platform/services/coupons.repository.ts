import type { CouponRule } from '../../../kernel/coupons';

export interface CouponRecord extends CouponRule {
  createdAt: Date;
}

export type NewCoupon = Omit<CouponRecord, 'createdAt' | 'active' | 'startsAt'>;

/** Cupones y sus usos. Un uso cuenta mientras su pedido sigue vivo o se entregó. */
export interface CouponsRepository {
  findByCode(code: string): Promise<CouponRecord | null>;
  create(coupon: NewCoupon): Promise<CouponRecord>;
  setActive(code: string, active: boolean): Promise<CouponRecord | null>;
  list(limit: number): Promise<CouponRecord[]>;
  /** Usos en pedidos que no se cancelaron, rechazaron ni vencieron (de todos, o de una persona). */
  countUses(code: string, userId?: string): Promise<number>;
  /** Pedidos de la persona que no se cancelaron, rechazaron ni vencieron (para «solo primer pedido»). */
  countLiveOrders(userId: string): Promise<number>;
}

export const COUPONS_REPOSITORY = Symbol('COUPONS_REPOSITORY');
