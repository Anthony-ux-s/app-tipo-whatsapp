import { Injectable } from '@nestjs/common';
import type { CouponKind, OrderStatus } from '@parla/types';
import type { Coupon as CouponRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { CouponRecord, CouponsRepository, NewCoupon } from './coupons.repository';

/** Un pedido que terminó así libera el cupón (no cuenta como uso). */
export const COUPON_FREED_BY: OrderStatus[] = ['cancelled', 'rejected', 'payment_expired'];

function toCouponRecord(row: CouponRow): CouponRecord {
  return { ...row, kind: row.kind as CouponKind };
}

@Injectable()
export class PrismaCouponsRepository implements CouponsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<CouponRecord | null> {
    const row = await this.prisma.coupon.findUnique({ where: { code } });
    return row ? toCouponRecord(row) : null;
  }

  async create(coupon: NewCoupon): Promise<CouponRecord> {
    return toCouponRecord(await this.prisma.coupon.create({ data: coupon }));
  }

  async setActive(code: string, active: boolean): Promise<CouponRecord | null> {
    const { count } = await this.prisma.coupon.updateMany({ where: { code }, data: { active } });
    return count ? this.findByCode(code) : null;
  }

  async list(limit: number): Promise<CouponRecord[]> {
    const rows = await this.prisma.coupon.findMany({ where: { ownerUserId: null }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(toCouponRecord);
  }

  countUses(code: string, userId?: string): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: { couponCode: code, ...(userId ? { userId } : {}), order: { status: { notIn: COUPON_FREED_BY } } },
    });
  }

  countLiveOrders(userId: string): Promise<number> {
    return this.prisma.order.count({ where: { userId, status: { notIn: COUPON_FREED_BY } } });
  }
}
