import { Inject, Injectable, Optional } from '@nestjs/common';
import type { DeliverOrderRequest, DriverInfo, DriverOrder, DriverOrders } from '@parla/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { deliveryPaidOnArrival, formatSoles, MAX_DELIVERY_CODE_ATTEMPTS } from '../../../../kernel/order-rules';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { DispatchPolicy } from '../dispatch.policy';
import { DRIVER_LEDGER_REPOSITORY, type DriverLedgerRepository } from '../driver-ledger.repository';
import { DriverPayPolicy } from '../driver-pay.policy';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { DELIVERY_SETTINGS_REPOSITORY, type DeliverySettingsRepository } from '../delivery-settings.repository';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { PHOTOS_REPOSITORY, type PhotosRepository } from '../photos.repository';
import { customersOf, OrderEvents, toDriverOrder } from './orders.use-cases';
import { assertOwnPhoto } from './photos.use-cases';
import { RecordStoreSaleUseCase } from './store-wallet.use-cases';

const DRIVER_LIMIT = 50;

/** Repartidor activo; para tomar o entregar pedidos, además, aprobado por soporte. */
export async function requireDriver(drivers: DriversRepository, userId: string, approved = true): Promise<DriverRecord> {
  const driver = await drivers.findByUser(userId);
  if (!driver?.active) throw new ForbiddenError('Tu cuenta no es de repartidor de Rapidito');
  if (approved && driver.status !== 'approved') {
    throw new ForbiddenError(driver.status === 'rejected' ? 'Soporte rechazó tu registro. Revisa el motivo en tu perfil.' : 'Tu registro está en revisión: te avisamos apenas soporte lo apruebe.');
  }
  return driver;
}

export function toDriverInfo(d: DriverRecord): DriverInfo {
  return { vehicle: d.vehicle, plate: d.plate, online: d.online, status: d.status, reviewNote: d.reviewNote, hasDocument: !!d.documentPhotoId };
}

/** El perfil de repartidor de quien consulta, o null si no reparte. */
@Injectable()
export class GetMyDriverUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string): Promise<DriverInfo | null> {
    const driver = await this.drivers.findByUser(userId);
    return driver?.active ? toDriverInfo(driver) : null;
  }
}

/** Pedidos listos para recoger cerca (ofertas por cercanía) y los que tomó el repartidor. */
@Injectable()
export class ListDriverOrdersUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
  ) {}

  async execute(userId: string): Promise<DriverOrders> {
    const driver = await requireDriver(this.drivers, userId, false);
    const [all, mine] = await Promise.all([
      driver.status === 'approved' ? this.orders.listAvailableForDrivers(DRIVER_LIMIT) : Promise.resolve([]),
      this.orders.listForDriver(userId, DRIVER_LIMIT),
    ]);
    const available = all.filter((o) => this.dispatch.canSee(o, driver));
    const customers = await customersOf(this.users, [...available, ...mine]);
    return {
      available: available.map((o) => toDriverOrder(o, userId, customers, this.pay, driver.location)),
      mine: mine.map((o) => toDriverOrder(o, userId, customers, this.pay, driver.location)),
    };
  }
}

/**
 * Un pedido para el repartidor: si está disponible y le alcanza la oferta por cercanía, o si es suyo.
 * Si lo tomó otro, o aún no le llega la oferta, 404.
 */
async function findDriverOrder(orders: OrdersRepository, dispatch: DispatchPolicy, driver: DriverRecord, id: string): Promise<OrderRecord> {
  const order = await orders.findById(id);
  const available = order?.status === 'searching_driver' && !order.driverId && dispatch.canSee(order, driver);
  if (!order || (!available && order.driverId !== driver.userId)) throw new NotFoundError('Pedido no encontrado');
  return order;
}

@Injectable()
export class GetDriverOrderUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    const driver = await requireDriver(this.drivers, userId, false);
    const order = await findDriverOrder(this.orders, this.dispatch, driver, id);
    return toDriverOrder(order, userId, await customersOf(this.users, [order]), this.pay, driver.location);
  }
}

/**
 * El repartidor toma un pedido listo. Gana el primero (cambio atómico): si otro lo tomó un instante
 * antes, recibe 409. Repetirlo siendo suyo no cambia nada. Puede llevar varios a la vez, hasta lo
 * que configure soporte (como Rappi o PedidosYa); «Mis rutas» le da el orden para recogerlos y entregarlos.
 */
@Injectable()
export class AcceptDeliveryUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    /** Para no dejar tomar pedidos a quien debe demasiado a Parla en comisiones (opcional en pruebas). */
    @Optional() @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger?: DriverLedgerRepository,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    const driver = await requireDriver(this.drivers, userId);
    let order = await findDriverOrder(this.orders, this.dispatch, driver, id);
    if (order.driverId !== userId) {
      if (!driver.online) throw new ConflictError('Conéctate para tomar pedidos');
      if (this.ledger) {
        const { availableCents } = await this.ledger.balance(userId);
        if (availableCents < -this.pay.config.maxDebtCents) {
          throw new ConflictError(`Debes ${formatSoles(-availableCents)} a Parla por las comisiones de tus deliveries. Págalos para seguir tomando pedidos.`);
        }
      }
      const max = (await this.settings.get()).pricing.maxActiveOrders;
      if ((await this.orders.countActiveForDriver(userId)) >= max) {
        throw new ConflictError(max === 1 ? 'Termina tu entrega en curso antes de tomar otra' : `Ya llevas ${max} pedidos: entrega alguno antes de tomar otro`);
      }
      const [me] = await this.users.findActiveByIds([userId]);
      const name = me?.displayName ?? 'Repartidor';
      const updated = await this.orders.updateIfStatus(id, 'searching_driver', {
        status: 'driver_assigned',
        driverId: userId,
        reservation: null,
        delivery: { provider: 'Rapidito', driverName: name, vehicle: driver.plate ? `${driver.vehicle} · ${driver.plate}` : driver.vehicle, etaMinutes: order.etaMinutes, updatedAt: new Date().toISOString() },
        note: `${name} · ${driver.vehicle}${driver.plate ? ` ${driver.plate}` : ''}`,
      });
      if (!updated) throw new ConflictError('Otro repartidor tomó este pedido');
      this.events.changed(updated);
      order = updated;
    }
    return toDriverOrder(order, userId, await customersOf(this.users, [order]), this.pay, driver.location);
  }
}

/**
 * El repartidor suelta un pedido que tomó y todavía no recogió («No puedo llevarlo»): vuelve a
 * ofrecerse a los demás repartidores, desde la primera oleada. Ya recogido, no se puede soltar.
 */
@Injectable()
export class ReleaseDeliveryUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    const driver = await requireDriver(this.drivers, userId, false);
    const order = await this.orders.findById(id);
    if (!order || (order.driverId !== userId && order.status !== 'searching_driver')) throw new NotFoundError('Pedido no encontrado');
    if (order.driverId !== userId) return toDriverOrder(order, userId, await customersOf(this.users, [order]), this.pay, driver.location);
    if (order.status !== 'driver_assigned') throw new ConflictError('Ya recogiste este pedido: entrégalo al cliente');
    const updated = await this.orders.updateIfStatus(id, 'driver_assigned', {
      status: 'searching_driver',
      driverId: null,
      delivery: null,
      ...(await this.dispatch.openOffer()),
      note: `${order.delivery?.driverName ?? 'El repartidor'} no pudo llevarlo · se ofrece a otro`,
    });
    if (!updated) throw new ConflictError('El pedido ya cambió de estado');
    this.events.changed(updated, userId);
    return toDriverOrder(updated, userId, await customersOf(this.users, [updated]), this.pay, driver.location);
  }
}

/**
 * Entrega con código (como el PIN de Rappi): el cliente se lo dicta al repartidor al recibir el
 * pedido. Al quinto intento fallido se bloquea, para que no se adivine. Si el cliente no responde, el
 * repartidor puede dejarlo (p. ej. en portería) solo con una foto como prueba: queda anotado, la
 * tienda y el cliente lo ven, y el cliente puede reclamar.
 */
@Injectable()
export class DeliverOrderUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
    @Inject(PHOTOS_REPOSITORY) private readonly photos: PhotosRepository,
    /** La venta de la tienda (productos menos comisión) suma a su billetera al entregarse. */
    @Optional() private readonly storeSales?: RecordStoreSaleUseCase,
  ) {}

  async execute(userId: string, id: string, input: DeliverOrderRequest): Promise<DriverOrder> {
    const driver = await requireDriver(this.drivers, userId);
    let order = await findDriverOrder(this.orders, this.dispatch, driver, id);
    if (order.status !== 'delivered') {
      if (order.status !== 'on_the_way') throw new ConflictError('Primero recoge el pedido en la tienda');
      const code = input.code?.trim() ?? '';
      const photoId = input.photoId?.trim() || null;
      if (!code && !photoId) throw new ValidationError('Pide el código al cliente o, si no responde, deja el pedido con una foto');
      if (photoId) await assertOwnPhoto(this.photos, userId, photoId);
      const changes: OrderChanges = {
        status: 'delivered',
        delivery: { ...(order.delivery ?? { provider: 'Rapidito', driverName: null, vehicle: null }), etaMinutes: 0, updatedAt: new Date().toISOString() },
        ...(photoId ? { deliveryPhotoId: photoId } : {}),
      };
      const by = order.delivery?.driverName ?? 'Repartidor';
      if (code) {
        if (order.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS) {
          throw new ConflictError('Demasiados intentos con un código equivocado. Escribe al cliente por el chat o déjalo con una foto.');
        }
        if (!/^\d{4}$/.test(code)) throw new ValidationError('El código tiene 4 dígitos');
        if (code !== order.deliveryCode) {
          const attempts = await this.orders.addFailedCodeAttempt(id);
          const left = MAX_DELIVERY_CODE_ATTEMPTS - attempts;
          throw new ValidationError(left > 0 ? `Código incorrecto. Te quedan ${left} intentos.` : 'Código incorrecto. Se bloqueó la entrega con código.');
        }
        changes.note = `Confirmado con el código del cliente${photoId ? ' y con foto' : ''} · ${by}`;
      } else {
        changes.deliveredWithoutCode = true;
        changes.note = `Dejado sin código, con foto como prueba (el cliente no respondió) · ${by}`;
      }
      const updated = await this.orders.updateIfStatus(id, 'on_the_way', changes);
      if (!updated) throw new ConflictError('El pedido ya cambió de estado');
      this.events.changed(updated);
      order = updated;
    }
    // A su saldo: tarifa, menos la comisión de Rapidito (DRIVER_SHARE_PERCENT), más la propina. Se
    // descuenta sola y, si la entrega se confirma dos veces, no se anota dos veces. Si el cliente le pagó el delivery en mano
    // (efectivo, Yape o Plin), ese dinero ya lo tiene: solo queda anotada la comisión que debe a Parla.
    const split = this.pay.split(order.deliveryFeeCents, order.tipCents);
    const cashCents = deliveryPaidOnArrival(order) ? order.deliveryFeeCents + order.tipCents : 0;
    await this.ledger.recordDelivery({ driverId: userId, orderId: order.id, feeCents: order.deliveryFeeCents, commissionCents: split.commissionCents, tipCents: order.tipCents, cashCents });
    await this.storeSales?.execute(order);
    return toDriverOrder(order, userId, await customersOf(this.users, [order]), this.pay, driver.location);
  }
}
