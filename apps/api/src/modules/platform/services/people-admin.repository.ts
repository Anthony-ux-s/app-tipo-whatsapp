import type { AdminPeopleFilter, AdminPerson, AdminTraffic, PersonRole } from '@parla/types';

/** Una persona tal como la guarda la base (la foto y «en línea» los pone el caso de uso). */
export type PersonRow = Omit<AdminPerson, 'online' | 'avatarUrl'> & { avatarFileId: string | null };

export interface TopVisitorRow {
  id: string;
  displayName: string;
  avatarFileId: string | null;
  avatarColor: string;
  roles: PersonRole[];
  visits: number;
  activeDays: number;
}

export interface TrafficRows {
  /** Por día (AAAA-MM-DD): visitas y personas distintas. */
  visits: { day: string; visits: number; users: number }[];
  /** Fechas de alta y de pedidos desde el inicio del período (se agrupan por día en Lima). */
  signups: Date[];
  orders: Date[];
  totals: Pick<AdminTraffic['totals'], 'users' | 'clients' | 'drivers' | 'driversOnline' | 'businesses' | 'blocked'>;
  top: TopVisitorRow[];
}

/** Lo que el panel de soporte ve de las personas y del tráfico de la app. */
export interface PeopleAdminRepository {
  /** Personas (las más recientes primero) por tipo de cuenta, buscando por nombre, usuario o teléfono. */
  list(filter: AdminPeopleFilter, query: string, visitsSinceDay: string, limit: number): Promise<PersonRow[]>;
  setBlocked(userId: string, blocked: { at: Date; reason: string } | null): Promise<PersonRow | null>;
  traffic(sinceDay: string, since: Date, topLimit: number): Promise<TrafficRows>;
}

export const PEOPLE_ADMIN_REPOSITORY = Symbol('PEOPLE_ADMIN_REPOSITORY');
