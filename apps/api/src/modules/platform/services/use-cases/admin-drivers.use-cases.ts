import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AdminDriver, DriverStatus, PushPayload, RatingSummary } from '@parla/types';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { DRIVER_LEDGER_REPOSITORY, type DriverLedgerRepository } from '../driver-ledger.repository';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders.repository';
import { requireAdmin } from './claims.use-cases';
import { toDriverInfo } from './driver-orders.use-cases';

const ADMIN_LIMIT = 100;
const ADMIN_LIST_LIMIT = ADMIN_LIMIT;

const NO_RATING: RatingSummary = { average: null, count: 0 };

async function toAdminDriver(d: DriverRecord, users: AuthRepository, ledger?: DriverLedgerRepository, rating: RatingSummary = NO_RATING): Promise<AdminDriver> {
  const [user] = await users.findActiveByIds([d.userId]);
  const debtCents = ledger ? Math.max(0, -(await ledger.balance(d.userId)).availableCents) : 0;
  return {
    userId: d.userId,
    displayName: user?.displayName ?? 'Cuenta eliminada',
    phone: user?.phone ?? null,
    vehicle: d.vehicle,
    plate: d.plate,
    dniNumber: d.dniNumber,
    licenseNumber: d.licenseNumber,
    hasDocument: !!d.documentPhotoId,
    status: d.status,
    reviewNote: d.reviewNote,
    debtCents,
    rating,
    createdAt: d.createdAt.toISOString(),
  };
}

/**
 * Soporte registra que un repartidor pagó (a Parla, por Yape o transferencia) la comisión del delivery que cobró en
 * mano. Baja su deuda; si la deuda supera el máximo, no puede tomar pedidos hasta pagar.
 */
@Injectable()
export class RecordCommissionPaymentUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
  ) {}

  async execute(adminId: string, driverId: string, amountCents: number): Promise<{ debtCents: number }> {
    await requireAdmin(this.users, adminId);
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1_000_000) throw new ValidationError('El monto va de S/ 0.01 a S/ 10 000');
    if (!(await this.drivers.findByUser(driverId))) throw new NotFoundError('Ese repartidor no existe');
    await this.ledger.recordCommissionPayment(driverId, amountCents);
    const { availableCents } = await this.ledger.balance(driverId);
    return { debtCents: Math.max(0, -availableCents) };
  }
}

/** Repartidores por revisar (o ya aprobados/rechazados), los más antiguos primero. */
@Injectable()
export class ListDriversForReviewUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Optional() @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger?: DriverLedgerRepository,
    @Optional() @Inject(ORDERS_REPOSITORY) private readonly orders?: OrdersRepository,
  ) {}

  async execute(adminId: string, status: DriverStatus): Promise<AdminDriver[]> {
    await requireAdmin(this.users, adminId);
    const list = await this.drivers.listByStatus(status, ADMIN_LIST_LIMIT);
    const ratings = (await this.orders?.driverRatingSummaries(list.map((d) => d.userId))) ?? new Map<string, RatingSummary>();
    const drivers = await Promise.all(list.map((d) => toAdminDriver(d, this.users, this.ledger, ratings.get(d.userId) ?? NO_RATING)));
    // Los aprobados van del mejor al peor calificado (a igual promedio, el que más entregas calificadas tiene); los demás, como llegaron.
    if (status === 'approved') drivers.sort((a, b) => (b.rating.average ?? -1) - (a.rating.average ?? -1) || b.rating.count - a.rating.count);
    return drivers;
  }
}

/**
 * Soporte aprueba al repartidor (ya puede conectarse) o lo rechaza con un motivo que él ve en su
 * perfil. Para aprobar tiene que haber subido la foto de su documento.
 */
@Injectable()
export class ReviewDriverUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    private readonly notifications: NotificationDispatcher,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(adminId: string, userId: string, decision: 'approve' | 'reject', note: string): Promise<AdminDriver> {
    await requireAdmin(this.users, adminId);
    const driver = await this.drivers.findByUser(userId);
    if (!driver?.active) throw new NotFoundError('Repartidor no encontrado');
    const reason = note.trim().slice(0, 300);
    if (decision === 'approve' && !driver.documentPhotoId) throw new ConflictError('Todavía no subió la foto de su documento');
    if (decision === 'reject' && !reason) throw new ValidationError('Escribe el motivo para el repartidor');
    const updated = await this.drivers.update(userId, {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewNote: decision === 'approve' ? null : reason,
      ...(decision === 'reject' ? { online: false } : {}),
    });
    const push: PushPayload =
      decision === 'approve'
        ? { title: '¡Ya eres repartidor de Rapidito!', body: 'Soporte aprobó tu registro. Conéctate para recibir pedidos.', url: '/app/rapidito', tag: 'driver-review' }
        : { title: 'Revisamos tu registro', body: reason, url: '/app/rapidito/perfil', tag: 'driver-review' };
    this.realtime.toUsers([userId], 'driver:updated', toDriverInfo(updated));
    void this.notifications.notify([userId], () => push);
    return toAdminDriver(updated, this.users);
  }
}

/** La foto del documento: para soporte, o para el propio repartidor. */
@Injectable()
export class GetDriverDocumentUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
  ) {}

  async execute(viewerId: string, driverId: string): Promise<string | null> {
    if (viewerId !== driverId) await requireAdmin(this.users, viewerId);
    const driver = await this.drivers.findByUser(driverId);
    if (!driver) throw new NotFoundError('Repartidor no encontrado');
    return driver.documentPhotoId;
  }
}
