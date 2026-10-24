import { Inject, Injectable } from '@nestjs/common';
import type { DriverEarnings, DriverInfo, DriverLocation, DriverProfileRequest, GeoPoint } from '@parla/types';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { ConflictError } from '../../../../kernel/domain-error';
import { assertPoint, normalizeDriverDocuments, normalizeDriverProfile } from '../../../../kernel/geo';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { DRIVER_LEDGER_REPOSITORY, type DriverLedgerRepository } from '../driver-ledger.repository';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders.repository';
import { PHOTOS_REPOSITORY, type PhotosRepository } from '../photos.repository';
import { requireDriver, toDriverInfo } from './driver-orders.use-cases';
import { rejectIfSupport } from './claims.use-cases';
import { assertOwnPhoto } from './photos.use-cases';

/** Cada cuánto, como mucho, se guarda y se reparte la ubicación (el celular puede mandar más seguido). */
const LOCATION_MIN_INTERVAL_MS = 3_000;

const toInfo = toDriverInfo;
/** Activo, esté o no aprobado (para su perfil y sus documentos). */
const requireActiveDriver = (drivers: DriversRepository, userId: string): Promise<DriverRecord> => requireDriver(drivers, userId, false);

/**
 * «Trabaja con Rapidito»: cualquier cuenta se registra como repartidor con su DNI (y su licencia si
 * maneja moto o auto). Queda en revisión hasta que soporte revise sus datos y la foto de su documento,
 * como en Rappi o PedidosYa; si ya había sido aprobado y vuelve, sigue aprobado.
 */
@Injectable()
export class RegisterDriverUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string, input: DriverProfileRequest): Promise<DriverInfo> {
    await rejectIfSupport(this.users, userId, 'ser repartidoras');
    const profile = normalizeDriverProfile(input.vehicle, input.plate);
    const docs = normalizeDriverDocuments(profile.vehicle, input.dniNumber, input.licenseNumber);
    if ((await this.drivers.findByUser(userId))?.active) throw new ConflictError('Ya eres repartidor de Rapidito');
    return toInfo(await this.drivers.register(userId, { ...profile, ...docs }));
  }
}

/** La foto del documento (DNI o licencia) para la verificación; volver a subirla la reemplaza. */
@Injectable()
export class SetDriverDocumentUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(PHOTOS_REPOSITORY) private readonly photos: PhotosRepository,
  ) {}

  async execute(userId: string, photoId: string): Promise<DriverInfo> {
    const driver = await requireActiveDriver(this.drivers, userId);
    await assertOwnPhoto(this.photos, userId, photoId);
    // Un rechazado que corrige su documento vuelve a revisión.
    const status = driver.status === 'rejected' ? 'pending' : driver.status;
    return toInfo(await this.drivers.update(userId, { documentPhotoId: photoId, status }));
  }
}

/** Cambiar el vehículo o la placa. */
@Injectable()
export class UpdateDriverProfileUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, input: DriverProfileRequest): Promise<DriverInfo> {
    const driver = await requireActiveDriver(this.drivers, userId);
    const profile = normalizeDriverProfile(input.vehicle, input.plate);
    // Pasar a moto o auto pide licencia (si no la tenía).
    const docs = normalizeDriverDocuments(profile.vehicle, driver.dniNumber ?? input.dniNumber, input.licenseNumber ?? driver.licenseNumber ?? undefined);
    return toInfo(await this.drivers.update(userId, { ...profile, licenseNumber: docs.licenseNumber }));
  }
}

/** Conectarse (recibe ofertas y puede tomar pedidos) o desconectarse. La entrega en curso sigue. */
@Injectable()
export class SetDriverOnlineUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, online: boolean): Promise<DriverInfo> {
    // Solo los aprobados se conectan; desconectarse, siempre.
    if (online) await requireDriver(this.drivers, userId);
    else await requireActiveDriver(this.drivers, userId);
    return toInfo(await this.drivers.update(userId, { online }));
  }
}

/** «Dejar de repartir»: deja de recibir pedidos; sus entregas quedan en el historial de todos. */
@Injectable()
export class LeaveDriverUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await requireActiveDriver(this.drivers, userId);
    if ((await this.orders.countActiveForDriver(userId)) > 0) throw new ConflictError('Termina o suelta tu entrega en curso antes de dejar de repartir');
    await this.drivers.update(userId, { active: false, online: false });
  }
}

/**
 * Lo ganado (neto: 95 % de la tarifa + propinas, ya descontada la comisión de Rapidito) hoy, en los
 * últimos 7 días y en total, según su libro de movimientos.
 */
@Injectable()
export class GetDriverEarningsUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
  ) {}

  async execute(userId: string, now = new Date()): Promise<DriverEarnings> {
    await requireActiveDriver(this.drivers, userId);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const week = new Date(today.getTime() - 6 * 24 * 3_600_000);
    const [d, w, t, rating] = await Promise.all([
      this.ledger.totals(userId, today),
      this.ledger.totals(userId, week),
      this.ledger.totals(userId),
      this.orders.ratingSummary({ driverId: userId }),
    ]);
    return {
      todayCents: d.netCents,
      todayDeliveries: d.deliveries,
      weekCents: w.netCents,
      weekDeliveries: w.deliveries,
      totalCents: t.netCents,
      totalDeliveries: t.deliveries,
      tipsCents: t.tipsCents,
      commissionCents: t.commissionCents,
      rating,
    };
  }
}

/**
 * El celular del repartidor manda su ubicación mientras está conectado. Libre, solo se guarda (para
 * ofrecerle los pedidos cercanos; nadie la ve). Con una entrega en curso, además se reparte en vivo
 * al cliente y a la tienda de ese pedido.
 */
@Injectable()
export class ReportDriverLocationUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(userId: string, point: GeoPoint, now = new Date()): Promise<{ shared: number }> {
    assertPoint(point);
    const driver = await requireActiveDriver(this.drivers, userId);
    const active = await this.orders.listActiveForDriver(userId);
    if (active.length === 0 && !driver.online) return { shared: 0 };
    if (driver.location && now.getTime() - driver.location.at.getTime() < LOCATION_MIN_INTERVAL_MS) return { shared: 0 };
    await this.drivers.saveLocation(userId, point, now);
    for (const order of active) {
      const location: DriverLocation = { orderId: order.id, lat: point.lat, lng: point.lng, at: now.toISOString() };
      this.realtime.toUsers([order.userId, ...(order.business ? [order.business.ownerId] : [])], 'delivery:location', location);
    }
    return { shared: active.length };
  }
}
