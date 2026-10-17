import { Inject, Injectable } from '@nestjs/common';
import type { DriverEarnings, DriverInfo, DriverLocation, DriverProfileRequest, GeoPoint } from '@parla/types';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { ConflictError, ForbiddenError } from '../../../../kernel/domain-error';
import { assertPoint, normalizeDriverProfile } from '../../../../kernel/geo';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders.repository';

/** Cada cuánto, como mucho, se guarda y se reparte la ubicación (el celular puede mandar más seguido). */
const LOCATION_MIN_INTERVAL_MS = 3_000;

const toInfo = (d: DriverRecord): DriverInfo => ({ vehicle: d.vehicle, plate: d.plate, online: d.online });

async function requireActiveDriver(drivers: DriversRepository, userId: string): Promise<DriverRecord> {
  const driver = await drivers.findByUser(userId);
  if (!driver?.active) throw new ForbiddenError('Tu cuenta no es de repartidor de Rapidito');
  return driver;
}

/** «Trabaja con Rapidito»: cualquier cuenta se registra como repartidor (o vuelve, si lo había dejado). */
@Injectable()
export class RegisterDriverUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, input: DriverProfileRequest): Promise<DriverInfo> {
    const profile = normalizeDriverProfile(input.vehicle, input.plate);
    if ((await this.drivers.findByUser(userId))?.active) throw new ConflictError('Ya eres repartidor de Rapidito');
    return toInfo(await this.drivers.register(userId, profile));
  }
}

/** Cambiar el vehículo o la placa. */
@Injectable()
export class UpdateDriverProfileUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, input: DriverProfileRequest): Promise<DriverInfo> {
    await requireActiveDriver(this.drivers, userId);
    return toInfo(await this.drivers.update(userId, normalizeDriverProfile(input.vehicle, input.plate)));
  }
}

/** Conectarse (recibe ofertas y puede tomar pedidos) o desconectarse. La entrega en curso sigue. */
@Injectable()
export class SetDriverOnlineUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, online: boolean): Promise<DriverInfo> {
    await requireActiveDriver(this.drivers, userId);
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

/** Lo ganado: tarifas de las entregas terminadas hoy, en los últimos 7 días y en total. */
@Injectable()
export class GetDriverEarningsUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(userId: string, now = new Date()): Promise<DriverEarnings> {
    await requireActiveDriver(this.drivers, userId);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const week = new Date(today.getTime() - 6 * 24 * 3_600_000);
    const e = await this.orders.driverEarnings(userId, { today, week });
    return {
      todayCents: e.today[0],
      todayDeliveries: e.today[1],
      weekCents: e.week[0],
      weekDeliveries: e.week[1],
      totalCents: e.total[0],
      totalDeliveries: e.total[1],
    };
  }
}

/**
 * El celular del repartidor manda su ubicación mientras reparte. Se guarda y se reparte en vivo solo
 * al cliente y a la tienda de los pedidos que lleva (nadie más la ve). Sin entrega en curso, no se
 * guarda nada.
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
    if (active.length === 0) return { shared: 0 };
    if (driver.location && now.getTime() - driver.location.at.getTime() < LOCATION_MIN_INTERVAL_MS) return { shared: 0 };
    await this.drivers.saveLocation(userId, point, now);
    for (const order of active) {
      const location: DriverLocation = { orderId: order.id, lat: point.lat, lng: point.lng, at: now.toISOString() };
      this.realtime.toUsers([order.userId, ...(order.business ? [order.business.ownerId] : [])], 'delivery:location', location);
    }
    return { shared: active.length };
  }
}
