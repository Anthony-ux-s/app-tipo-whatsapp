import { Injectable } from '@nestjs/common';
import type { AdminPeopleFilter, PersonRole } from '@parla/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { PeopleAdminRepository, PersonRow, TrafficRows } from './people-admin.repository';

const PERSON_SELECT = {
  id: true,
  displayName: true,
  username: true,
  phone: true,
  avatarFileId: true,
  avatarColor: true,
  isAdmin: true,
  lastSeenAt: true,
  createdAt: true,
  blockedAt: true,
  blockedReason: true,
  business: { select: { name: true } },
  driver: { select: { status: true, active: true, _count: { select: { orders: { where: { status: 'delivered' } } } } } },
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

type PersonSelected = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

function rolesOf(u: { isAdmin: boolean; business: object | null; driver: { active: boolean } | null; _count: { orders: number } }): PersonRole[] {
  const roles: PersonRole[] = [];
  if (u.driver?.active) roles.push('driver');
  if (u.business) roles.push('business');
  if (u.isAdmin) roles.push('admin');
  // Cliente: quien pide, o quien no tiene otro papel.
  if (u._count.orders > 0 || roles.length === 0) roles.unshift('client');
  return roles;
}

const FILTERS: Record<AdminPeopleFilter, Prisma.UserWhereInput> = {
  all: {},
  clients: { isAdmin: false, business: { is: null }, OR: [{ driver: { is: null } }, { driver: { active: false } }] },
  drivers: { driver: { active: true } },
  businesses: { business: { isNot: null } },
  blocked: { blockedAt: { not: null } },
};

@Injectable()
export class PrismaPeopleAdminRepository implements PeopleAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async toRows(users: PersonSelected[], visitsSinceDay: string): Promise<PersonRow[]> {
    const visits = await this.prisma.userActivityDay.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) }, day: { gte: visitsSinceDay } },
      _sum: { visits: true },
    });
    const visitsOf = new Map(visits.map((v) => [v.userId, v._sum.visits ?? 0]));
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      phone: u.phone,
      avatarFileId: u.avatarFileId,
      avatarColor: u.avatarColor,
      roles: rolesOf(u),
      driverStatus: u.driver?.active ? u.driver.status : null,
      businessName: u.business?.name ?? null,
      orders: u._count.orders,
      deliveries: u.driver?._count.orders ?? 0,
      visits30d: visitsOf.get(u.id) ?? 0,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      blockedAt: u.blockedAt?.toISOString() ?? null,
      blockedReason: u.blockedReason,
    }));
  }

  async list(filter: AdminPeopleFilter, query: string, visitsSinceDay: string, limit: number): Promise<PersonRow[]> {
    const q = query.trim();
    const search: Prisma.UserWhereInput = q
      ? { OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { username: { contains: q.toLowerCase().replace(/^@/, ''), mode: 'insensitive' } }, { phone: { contains: q.replace(/\D/g, '') || q } }] }
      : {};
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, AND: [FILTERS[filter], search] },
      select: PERSON_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.toRows(users, visitsSinceDay);
  }

  async setBlocked(userId: string, blocked: { at: Date; reason: string } | null): Promise<PersonRow | null> {
    const found = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!found) return null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { blockedAt: blocked?.at ?? null, blockedReason: blocked?.reason ?? null },
      select: PERSON_SELECT,
    });
    // Un repartidor suspendido deja de recibir pedidos al instante.
    if (blocked) await this.prisma.driver.updateMany({ where: { userId }, data: { online: false } });
    const [row] = await this.toRows([user], '0000-00-00');
    return row;
  }

  async traffic(sinceDay: string, since: Date, topLimit: number): Promise<TrafficRows> {
    const live = { deletedAt: null };
    const [visits, signups, orders, users, clients, drivers, driversOnline, businesses, blocked, top] = await Promise.all([
      this.prisma.userActivityDay.groupBy({ by: ['day'], where: { day: { gte: sinceDay } }, _sum: { visits: true }, _count: { userId: true } }),
      this.prisma.user.findMany({ where: { ...live, createdAt: { gte: since } }, select: { createdAt: true } }),
      this.prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      this.prisma.user.count({ where: live }),
      this.prisma.user.count({ where: { ...live, ...FILTERS.clients } }),
      this.prisma.driver.count({ where: { active: true, user: live } }),
      this.prisma.driver.count({ where: { active: true, online: true, user: live } }),
      this.prisma.business.count(),
      this.prisma.user.count({ where: { ...live, blockedAt: { not: null } } }),
      this.prisma.userActivityDay.groupBy({
        by: ['userId'],
        where: { day: { gte: sinceDay } },
        _sum: { visits: true },
        _count: { day: true },
        orderBy: { _sum: { visits: 'desc' } },
        take: topLimit,
      }),
    ]);
    const people = await this.prisma.user.findMany({
      where: { id: { in: top.map((t) => t.userId) }, ...live },
      select: { id: true, displayName: true, avatarFileId: true, avatarColor: true, isAdmin: true, business: { select: { name: true } }, driver: { select: { active: true } }, _count: { select: { orders: true } } },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      visits: visits.map((v) => ({ day: v.day, visits: v._sum.visits ?? 0, users: v._count.userId })),
      signups: signups.map((s) => s.createdAt),
      orders: orders.map((o) => o.createdAt),
      totals: { users, clients, drivers, driversOnline, businesses, blocked },
      top: top.flatMap((t) => {
        const p = byId.get(t.userId);
        if (!p) return [];
        return [{ id: p.id, displayName: p.displayName, avatarFileId: p.avatarFileId, avatarColor: p.avatarColor, roles: rolesOf(p), visits: t._sum.visits ?? 0, activeDays: t._count.day }];
      }),
    };
  }
}
