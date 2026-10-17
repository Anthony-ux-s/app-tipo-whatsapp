import { Inject, Injectable } from '@nestjs/common';
import type { DriverInfo, DriverOrder, DriverOrders } from '@parla/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { splitDelivery } from '../../../../kernel/driver-earnings';
import { MAX_DELIVERY_CODE_ATTEMPTS } from '../../../../kernel/order-rules';
import { DRIVER_LEDGER_REPOSITORY, type DriverLedgerRepository } from '../driver-ledger.repository';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { customersOf, OrderEvents, toDriverOrder } from './orders.use-cases';

const DRIVER_LIMIT = 50;
/** Como en Rappi o PedidosYa con un solo pedido por viaje: una entrega a la vez. */
const MAX_ACTIVE_DELIVERIES = 1;

async function requireDriver(drivers: DriversRepository, userId: string): Promise<DriverRecord> {
  const driver = await drivers.findByUser(userId);
  if (!driver?.active) throw new ForbiddenError('Tu cuenta no es de repartidor de Rapidito');
  return driver;
}

/** El perfil de repartidor de quien consulta, o null si no reparte. */
@Injectable()
export class GetMyDriverUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string): Promise<DriverInfo | null> {
    const driver = await this.drivers.findByUser(userId);
    return driver?.active ? { vehicle: driver.vehicle, plate: driver.plate, online: driver.online } : null;
  }
}

/** Pedidos listos para recoger (ofertas) y los que tomó el repartidor. */
@Injectable()
export class ListDriverOrdersUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string): Promise<DriverOrders> {
    await requireDriver(this.drivers, userId);
    const [available, mine] = await Promise.all([
      this.orders.listAvailableForDrivers(DRIVER_LIMIT),
      this.orders.listForDriver(userId, DRIVER_LIMIT),
    ]);
    const customers = await customersOf(this.users, [...available, ...mine]);
    return {
      available: available.map((o) => toDriverOrder(o, userId, customers)),
      mine: mine.map((o) => toDriverOrder(o, userId, customers)),
    };
  }
}

/** Un pedido para el repartidor: si está disponible, o si es suyo. Si lo tomó otro, 404. */
async function findDriverOrder(orders: OrdersRepository, userId: string, id: string): Promise<OrderRecord> {
  const order = await orders.findById(id);
  const available = order?.status === 'searching_driver' && !order.driverId;
  if (!order || (!available && order.driverId !== userId)) throw new NotFoundError('Pedido no encontrado');
  return order;
}

@Injectable()
export class GetDriverOrderUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    await requireDriver(this.drivers, userId);
    const order = await findDriverOrder(this.orders, userId, id);
    return toDriverOrder(order, userId, await customersOf(this.users, [order]));
  }
}

/**
 * El repartidor toma un pedido listo. Gana el primero (cambio atómico): si otro lo tomó un instante
 * antes, recibe 409. Repetirlo siendo suyo no cambia nada.
 */
@Injectable()
export class AcceptDeliveryUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    const driver = await requireDriver(this.drivers, userId);
    let order = await findDriverOrder(this.orders, userId, id);
    if (order.driverId !== userId) {
      if (!driver.online) throw new ConflictError('Conéctate para tomar pedidos');
      if ((await this.orders.countActiveForDriver(userId)) >= MAX_ACTIVE_DELIVERIES) {
        throw new ConflictError('Termina tu entrega en curso antes de tomar otra');
      }
      const [me] = await this.users.findActiveByIds([userId]);
      const name = me?.displayName ?? 'Repartidor';
      const updated = await this.orders.updateIfStatus(id, 'searching_driver', {
        status: 'driver_assigned',
        driverId: userId,
        delivery: { provider: 'Rapidito', driverName: name, vehicle: driver.plate ? `${driver.vehicle} · ${driver.plate}` : driver.vehicle, etaMinutes: order.etaMinutes, updatedAt: new Date().toISOString() },
        note: `${name} · ${driver.vehicle}${driver.plate ? ` ${driver.plate}` : ''}`,
      });
      if (!updated) throw new ConflictError('Otro repartidor tomó este pedido');
      this.events.changed(updated);
      order = updated;
    }
    return toDriverOrder(order, userId, await customersOf(this.users, [order]));
  }
}

/**
 * El repartidor suelta un pedido que tomó y todavía no recogió («No puedo llevarlo»): vuelve a
 * ofrecerse a los demás repartidores. Ya recogido, no se puede soltar.
 */
@Injectable()
export class ReleaseDeliveryUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, id: string): Promise<DriverOrder> {
    await requireDriver(this.drivers, userId);
    const order = await this.orders.findById(id);
    if (!order || (order.driverId !== userId && order.status !== 'searching_driver')) throw new NotFoundError('Pedido no encontrado');
    if (order.driverId !== userId) return toDriverOrder(order, userId, await customersOf(this.users, [order]));
    if (order.status !== 'driver_assigned') throw new ConflictError('Ya recogiste este pedido: entrégalo al cliente');
    const updated = await this.orders.updateIfStatus(id, 'driver_assigned', {
      status: 'searching_driver',
      driverId: null,
      delivery: null,
      note: `${order.delivery?.driverName ?? 'El repartidor'} no pudo llevarlo · se ofrece a otro`,
    });
    if (!updated) throw new ConflictError('El pedido ya cambió de estado');
    this.events.changed(updated, userId);
    return toDriverOrder(updated, userId, await customersOf(this.users, [updated]));
  }
}

/**
 * Entrega con código (como el PIN de Rappi): el cliente se lo dicta al repartidor al recibir el
 * pedido, y sin él no se puede marcar como entregado. Al quinto intento fallido se bloquea, para que
 * no se adivine; el repartidor escribe por el chat del pedido.
 */
@Injectable()
export class DeliverOrderUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
  ) {}

  async execute(userId: string, id: string, code: string): Promise<DriverOrder> {
    await requireDriver(this.drivers, userId);
    let order = await findDriverOrder(this.orders, userId, id);
    if (order.status !== 'delivered') {
      if (order.status !== 'on_the_way') throw new ConflictError('Primero recoge el pedido en la tienda');
      if (order.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS) {
        throw new ConflictError('Demasiados intentos con un código equivocado. Escribe al cliente por el chat del pedido.');
      }
      if (!/^\d{4}$/.test(code.trim())) throw new ValidationError('El código tiene 4 dígitos');
      if (code.trim() !== order.deliveryCode) {
        const attempts = await this.orders.addFailedCodeAttempt(id);
        const left = MAX_DELIVERY_CODE_ATTEMPTS - attempts;
        throw new ValidationError(left > 0 ? `Código incorrecto. Te quedan ${left} intentos.` : 'Código incorrecto. Se bloqueó la entrega con código.');
      }
      const updated = await this.orders.updateIfStatus(id, 'on_the_way', {
        status: 'delivered',
        delivery: { ...(order.delivery ?? { provider: 'Rapidito', driverName: null, vehicle: null }), etaMinutes: 0, updatedAt: new Date().toISOString() },
        note: `Confirmado con el código del cliente · ${order.delivery?.driverName ?? 'Repartidor'}`,
      });
      if (!updated) throw new ConflictError('El pedido ya cambió de estado');
      this.events.changed(updated);
      order = updated;
    }
    // A su saldo: tarifa, menos la comisión de Rapidito (5 %), más la propina. Se descuenta sola y,
    // si la entrega se confirma dos veces, no se anota dos veces.
    const split = splitDelivery(order.deliveryFeeCents, order.tipCents);
    await this.ledger.recordDelivery({ driverId: userId, orderId: order.id, feeCents: order.deliveryFeeCents, commissionCents: split.commissionCents, tipCents: order.tipCents });
    return toDriverOrder(order, userId, await customersOf(this.users, [order]));
  }
}
