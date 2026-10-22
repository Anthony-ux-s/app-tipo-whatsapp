import { Injectable } from '@nestjs/common';
import type { CampaignKind, CouponKind, CustomerSegment, MyCoupon, MyInterests, OrderLine, RoulettePrize, TrendsReport } from '@parla/types';
import { Prisma, type RouletteCampaign as CampaignRow } from '@prisma/client';
import { segmentOf, SEGMENT_ORDER, type CustomerStats } from '../../../kernel/customer-segments';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { COUPON_FREED_BY } from '../services/prisma-coupons.repository';
import type { CampaignNumbers, CampaignRecord, GrowthRepository, NewCampaign, NewSpin } from './growth.repository';

/** Un pedido que todavía no se pagó no cuenta como compra. */
const NOT_BOUGHT = [...COUPON_FREED_BY, 'pending_payment'];
const SEARCH_HISTORY_DAYS = 90;
const PURCHASE_HISTORY_DAYS = 180;
const TOP_INTERESTS = 30;

function toCampaign(row: CampaignRow): CampaignRecord {
  return { ...row, kind: row.kind as CampaignKind, segment: row.segment as CustomerSegment, prizes: JSON.parse(row.prizes) as RoulettePrize[] };
}

const linesOf = (json: string): OrderLine[] => {
  try {
    return JSON.parse(json) as OrderLine[];
  } catch {
    return [];
  }
};

@Injectable()
export class PrismaGrowthRepository implements GrowthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listCampaigns(): Promise<CampaignRecord[]> {
    return (await this.prisma.rouletteCampaign.findMany({ orderBy: { createdAt: 'desc' } })).map(toCampaign);
  }

  async findCampaign(id: string): Promise<CampaignRecord | null> {
    const row = await this.prisma.rouletteCampaign.findUnique({ where: { id } });
    return row ? toCampaign(row) : null;
  }

  async createCampaign(input: NewCampaign, adminId: string): Promise<CampaignRecord> {
    return toCampaign(await this.prisma.rouletteCampaign.create({ data: { ...input, prizes: JSON.stringify(input.prizes), createdById: adminId } }));
  }

  async updateCampaign(id: string, input: NewCampaign): Promise<CampaignRecord | null> {
    const { count } = await this.prisma.rouletteCampaign.updateMany({ where: { id }, data: { ...input, prizes: JSON.stringify(input.prizes) } });
    return count ? this.findCampaign(id) : null;
  }

  async setEnabled(id: string, enabled: boolean): Promise<CampaignRecord | null> {
    const { count } = await this.prisma.rouletteCampaign.updateMany({ where: { id }, data: { enabled } });
    return count ? this.findCampaign(id) : null;
  }

  async campaignNumbers(id: string): Promise<CampaignNumbers> {
    const spins = await this.prisma.rouletteSpin.findMany({ where: { campaignId: id }, select: { couponCode: true } });
    const codes = spins.flatMap((s) => (s.couponCode ? [s.couponCode] : []));
    const used = codes.length
      ? await this.prisma.couponRedemption.findMany({ where: { couponCode: { in: codes }, order: { status: { notIn: COUPON_FREED_BY } } }, select: { discountCents: true } })
      : [];
    return { spins: spins.length, winners: codes.length, redeemed: used.length, discountCents: used.reduce((sum, r) => sum + r.discountCents, 0) };
  }

  async customerStats(userId: string): Promise<CustomerStats | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, blockedAt: true, isAdmin: true, business: { select: { id: true } }, driver: { select: { userId: true } } },
    });
    // Soporte, negocios y repartidores no son clientes: la ruleta no les sale.
    if (!user || user.blockedAt || user.isAdmin || user.business || user.driver) return null;
    const orders = await this.prisma.order.findMany({ where: { userId, status: { notIn: NOT_BOUGHT } }, select: { status: true, totalCents: true, createdAt: true } });
    return this.statsOf(user.createdAt, orders);
  }

  private statsOf(registeredAt: Date, orders: { status: string; totalCents: number; createdAt: Date }[]): CustomerStats {
    return {
      registeredAt,
      paidOrders: orders.length,
      deliveredOrders: orders.filter((o) => o.status === 'delivered').length,
      spentCents: orders.reduce((sum, o) => sum + o.totalCents, 0),
      lastOrderAt: orders.reduce<Date | null>((latest, o) => (!latest || o.createdAt > latest ? o.createdAt : latest), null),
    };
  }

  async segmentCounts(now: Date): Promise<Record<CustomerSegment, number>> {
    const [users, orders] = await Promise.all([
      this.prisma.user.findMany({ where: { isAdmin: false, blockedAt: null, business: { is: null }, driver: { is: null } }, select: { id: true, createdAt: true } }),
      this.prisma.order.findMany({ where: { status: { notIn: NOT_BOUGHT } }, select: { userId: true, status: true, totalCents: true, createdAt: true } }),
    ]);
    const byUser = new Map<string, typeof orders>();
    for (const o of orders) byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o]);
    const counts = Object.fromEntries(SEGMENT_ORDER.map((s) => [s, 0])) as Record<CustomerSegment, number>;
    for (const u of users) counts[segmentOf(this.statsOf(u.createdAt, byUser.get(u.id) ?? []), now)] += 1;
    counts.all = users.length;
    return counts;
  }

  async hasSpun(userId: string, campaignId: string, slot: number): Promise<boolean> {
    return (await this.prisma.rouletteSpin.count({ where: { userId, campaignId, slot } })) > 0;
  }

  async recordSpin(spin: NewSpin): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (spin.coupon) {
          await tx.coupon.create({
            data: { ...spin.coupon, firstOrderOnly: false, perUserLimit: 1, maxUses: 1, ownerUserId: spin.userId },
          });
        }
        await tx.rouletteSpin.create({
          data: { campaignId: spin.campaignId, userId: spin.userId, slot: spin.slot, prizeId: spin.prize.id, prizeLabel: spin.prize.label, couponCode: spin.coupon?.code ?? null },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async myCoupons(userId: string, now: Date): Promise<MyCoupon[]> {
    const rows = await this.prisma.coupon.findMany({
      where: {
        ownerUserId: userId,
        active: true,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        redemptions: { none: { order: { status: { notIn: COUPON_FREED_BY } } } },
      },
      orderBy: { endsAt: 'asc' },
    });
    return rows.map((c) => ({ code: c.code, description: c.description, kind: c.kind as CouponKind, minSubtotalCents: c.minSubtotalCents, endsAt: c.endsAt?.toISOString() ?? null }));
  }

  async logSearch(userId: string, service: string, term: string): Promise<void> {
    await this.prisma.searchEvent.create({ data: { userId, service, term } });
  }

  async interests(userId: string, now: Date): Promise<MyInterests> {
    const orders = await this.prisma.order.findMany({
      where: { userId, status: { notIn: NOT_BOUGHT }, createdAt: { gte: new Date(now.getTime() - PURCHASE_HISTORY_DAYS * 86_400_000) } },
      select: { lines: true, createdAt: true },
    });
    const bought = new Map<string, { quantity: number; lastAt: Date }>();
    for (const o of orders) {
      for (const l of linesOf(o.lines)) {
        const prev = bought.get(l.productId);
        bought.set(l.productId, { quantity: (prev?.quantity ?? 0) + l.quantity, lastAt: prev && prev.lastAt > o.createdAt ? prev.lastAt : o.createdAt });
      }
    }
    const searches = await this.prisma.searchEvent.groupBy({
      by: ['term'],
      where: { userId, createdAt: { gte: new Date(now.getTime() - SEARCH_HISTORY_DAYS * 86_400_000) } },
      _count: { term: true },
      orderBy: { _count: { term: 'desc' } },
      take: TOP_INTERESTS,
    });
    return {
      purchases: [...bought].map(([productId, v]) => ({ productId, quantity: v.quantity, lastAt: v.lastAt.toISOString() })).sort((a, b) => b.quantity - a.quantity).slice(0, TOP_INTERESTS),
      searches: searches.map((s) => ({ term: s.term, count: s._count.term })),
    };
  }

  async trends(since: Date, limit: number): Promise<Omit<TrendsReport, 'days'>> {
    const events = await this.prisma.searchEvent.findMany({ where: { createdAt: { gte: since } }, select: { userId: true, term: true } });
    const terms = new Map<string, { count: number; people: Set<string> }>();
    for (const e of events) {
      const t = terms.get(e.term) ?? { count: 0, people: new Set<string>() };
      t.count += 1;
      t.people.add(e.userId);
      terms.set(e.term, t);
    }
    const orders = await this.prisma.order.findMany({ where: { status: { notIn: NOT_BOUGHT }, createdAt: { gte: since } }, select: { userId: true, lines: true } });
    const products = new Map<string, { name: string; quantity: number; people: Set<string> }>();
    for (const o of orders) {
      for (const l of linesOf(o.lines)) {
        const p = products.get(l.productId) ?? { name: l.name, quantity: 0, people: new Set<string>() };
        p.quantity += l.quantity;
        p.people.add(o.userId);
        products.set(l.productId, p);
      }
    }
    return {
      searches: [...terms].map(([term, v]) => ({ term, count: v.count, people: v.people.size })).sort((a, b) => b.count - a.count).slice(0, limit),
      products: [...products].map(([productId, v]) => ({ productId, name: v.name, quantity: v.quantity, people: v.people.size })).sort((a, b) => b.quantity - a.quantity).slice(0, limit),
    };
  }
}
