import { Inject, Injectable } from '@nestjs/common';
import type { AdminPeopleFilter, AdminPerson, AdminTraffic, TrafficDay } from '@parla/types';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { lastDays, limaDay } from '../../../../kernel/traffic';
import { ACCOUNT_ACCESS, type AccountAccess } from '../../../../infra/identity/account-access.port';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { avatarUrlOf } from '../../identity/user.mapper';
import { PEOPLE_ADMIN_REPOSITORY, type PeopleAdminRepository, type PersonRow } from '../people-admin.repository';
import { requireAdmin } from './claims.use-cases';

const PEOPLE_LIMIT = 200;
const TOP_LIMIT = 10;

function toPerson(row: PersonRow, presence: PresenceRegistry): AdminPerson {
  const { avatarFileId, ...rest } = row;
  return { ...rest, avatarUrl: avatarUrlOf({ avatarFileId }), online: presence.statusOf(row.id) === 'online' };
}

/** Soporte: clientes, repartidores y negocios, con su actividad de los últimos 30 días. */
@Injectable()
export class ListPeopleUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PEOPLE_ADMIN_REPOSITORY) private readonly people: PeopleAdminRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(adminId: string, filter: AdminPeopleFilter, query: string, now = new Date()): Promise<AdminPerson[]> {
    await requireAdmin(this.users, adminId);
    const rows = await this.people.list(filter, query.slice(0, 60), lastDays(now, 30)[0], PEOPLE_LIMIT);
    return rows.map((r) => toPerson(r, this.presence));
  }
}

/** Soporte suspende o reactiva una cuenta: suspendida no entra ni usa la app (efecto inmediato). */
@Injectable()
export class SetPersonBlockedUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PEOPLE_ADMIN_REPOSITORY) private readonly people: PeopleAdminRepository,
    @Inject(ACCOUNT_ACCESS) private readonly access: AccountAccess,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(adminId: string, userId: string, blocked: boolean, reason = '', now = new Date()): Promise<AdminPerson> {
    await requireAdmin(this.users, adminId);
    if (userId === adminId) throw new ConflictError('No puedes suspender tu propia cuenta');
    const [target] = await this.users.findActiveByIds([userId]);
    if (target?.isAdmin && blocked) throw new ConflictError('No se puede suspender a otra cuenta de soporte');
    if (blocked && !reason.trim()) throw new ValidationError('Escribe el motivo de la suspensión');
    const row = await this.people.setBlocked(userId, blocked ? { at: now, reason: reason.trim() } : null);
    if (!row) throw new NotFoundError('Cuenta no encontrada');
    this.access.forget(userId);
    return toPerson(row, this.presence);
  }
}

/** Soporte: cuánta gente entra a la app por día, altas, pedidos y quiénes la usan más. */
@Injectable()
export class GetTrafficUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PEOPLE_ADMIN_REPOSITORY) private readonly people: PeopleAdminRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(adminId: string, days: number, now = new Date()): Promise<AdminTraffic> {
    await requireAdmin(this.users, adminId);
    const range = lastDays(now, days);
    // Un día de más hacia atrás: el corte en UTC no coincide con la medianoche de Lima.
    const since = new Date(now.getTime() - (days + 1) * 86_400_000);
    const rows = await this.people.traffic(range[0], since, TOP_LIMIT);
    const count = (dates: Date[]) => {
      const perDay = new Map<string, number>();
      for (const d of dates) perDay.set(limaDay(d), (perDay.get(limaDay(d)) ?? 0) + 1);
      return perDay;
    };
    const signups = count(rows.signups);
    const orders = count(rows.orders);
    const visits = new Map(rows.visits.map((v) => [v.day, v]));
    const series: TrafficDay[] = range.map((day) => ({
      day,
      visits: visits.get(day)?.visits ?? 0,
      uniqueUsers: visits.get(day)?.users ?? 0,
      signups: signups.get(day) ?? 0,
      orders: orders.get(day) ?? 0,
    }));
    const sum = (key: keyof Omit<TrafficDay, 'day'>) => series.reduce((s, d) => s + d[key], 0);
    return {
      days: series,
      totals: {
        ...rows.totals,
        onlineNow: this.presence.onlineCount(),
        activeToday: series[series.length - 1]?.uniqueUsers ?? 0,
        visits: sum('visits'),
        signups: sum('signups'),
        orders: sum('orders'),
      },
      topUsers: rows.top.map(({ avatarFileId, ...t }) => ({ ...t, avatarUrl: avatarUrlOf({ avatarFileId }) })),
    };
  }
}
