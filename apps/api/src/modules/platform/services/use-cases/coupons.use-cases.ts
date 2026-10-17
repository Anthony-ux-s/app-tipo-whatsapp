import { Inject, Injectable } from '@nestjs/common';
import type { AdminCoupon, AppliedCoupon, CreateCouponRequest, InternalCouponQuote } from '@parla/types';
import { assertCouponCode, assertCouponRule, normalizeCouponCode } from '../../../../kernel/coupons';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { COUPONS_REPOSITORY, type CouponRecord, type CouponsRepository } from '../coupons.repository';
import { requireAdmin } from './claims.use-cases';
import { evaluateCoupon } from './coupon-evaluation';

const ADMIN_LIMIT = 100;

/** Para el gateway, al cotizar: el descuento del cupón con el carrito y el delivery ya calculados. */
@Injectable()
export class QuoteCouponUseCase {
  constructor(@Inject(COUPONS_REPOSITORY) private readonly coupons: CouponsRepository) {}

  execute(input: InternalCouponQuote): Promise<AppliedCoupon> {
    return evaluateCoupon(this.coupons, input);
  }
}

async function toAdminCoupon(c: CouponRecord, coupons: CouponsRepository): Promise<AdminCoupon> {
  return {
    code: c.code,
    description: c.description,
    kind: c.kind,
    value: c.value,
    maxDiscountCents: c.maxDiscountCents,
    minSubtotalCents: c.minSubtotalCents,
    firstOrderOnly: c.firstOrderOnly,
    perUserLimit: c.perUserLimit,
    maxUses: c.maxUses,
    endsAt: c.endsAt?.toISOString() ?? null,
    active: c.active,
    uses: await coupons.countUses(c.code),
    createdAt: c.createdAt.toISOString(),
  };
}

/** Soporte: los cupones, del más nuevo al más viejo, con cuántas veces se usó cada uno. */
@Injectable()
export class ListCouponsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(COUPONS_REPOSITORY) private readonly coupons: CouponsRepository,
  ) {}

  async execute(adminId: string): Promise<AdminCoupon[]> {
    await requireAdmin(this.users, adminId);
    const list = await this.coupons.list(ADMIN_LIMIT);
    return Promise.all(list.map((c) => toAdminCoupon(c, this.coupons)));
  }
}

/** Soporte crea un cupón: descuento en %, monto fijo o envío gratis, con sus condiciones. */
@Injectable()
export class CreateCouponUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(COUPONS_REPOSITORY) private readonly coupons: CouponsRepository,
  ) {}

  async execute(adminId: string, input: CreateCouponRequest): Promise<AdminCoupon> {
    await requireAdmin(this.users, adminId);
    const code = normalizeCouponCode(input.code);
    assertCouponCode(code);
    const rule = {
      kind: input.kind,
      value: input.kind === 'free_delivery' ? 0 : (input.value ?? 0),
      maxDiscountCents: input.kind === 'percent' ? (input.maxDiscountCents ?? null) : null,
      minSubtotalCents: input.minSubtotalCents ?? 0,
      perUserLimit: input.perUserLimit ?? 1,
      maxUses: input.maxUses ?? null,
      description: input.description.trim().slice(0, 120),
    };
    assertCouponRule(rule);
    if (await this.coupons.findByCode(code)) throw new ConflictError('Ya existe un cupón con ese código');
    const created = await this.coupons.create({
      code,
      ...rule,
      firstOrderOnly: !!input.firstOrderOnly,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    });
    return toAdminCoupon(created, this.coupons);
  }
}

/** Pausar o reactivar un cupón (no se borra: sus usos quedan en los pedidos). */
@Injectable()
export class SetCouponActiveUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(COUPONS_REPOSITORY) private readonly coupons: CouponsRepository,
  ) {}

  async execute(adminId: string, code: string, active: boolean): Promise<AdminCoupon> {
    await requireAdmin(this.users, adminId);
    const updated = await this.coupons.setActive(normalizeCouponCode(code), active);
    if (!updated) throw new NotFoundError('Ese cupón no existe');
    return toAdminCoupon(updated, this.coupons);
  }
}
