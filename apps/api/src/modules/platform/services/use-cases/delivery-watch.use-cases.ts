import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { OrderStatus, PushPayload } from '@parla/types';
import { APP_ENV, type AppEnv, type DeliveryWatchConfig } from '../../../../config/env.validation';
import { driverOfferPush } from '../../../../kernel/order-rules';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { DispatchPolicy } from '../dispatch.policy';
import { DriverPayPolicy } from '../driver-pay.policy';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { DRIVERS_REPOSITORY, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { customersOf, OrderEvents, toDriverOrder } from './orders.use-cases';

const MINUTE = 60_000;
const WATCH_LIMIT = 200;

/** Desde cuándo está el pedido en su estado actual (la última anotación de ese estado). */
function since(order: OrderRecord, status: OrderStatus): Date {
  const entry = [...order.timeline].reverse().find((t) => t.status === status);
  return entry ? new Date(entry.at) : order.updatedAt;
}

function untakenPush(orderId: string, minutes: number): PushPayload {
  return {
    title: 'Tu pedido sigue esperando repartidor',
    body: `Nadie lo tomó en ${minutes} minutos. Lo volvimos a ofrecer a los repartidores conectados.`,
    url: `/app/negocio/pedidos/${orderId}`,
    tag: `business-order-${orderId}`,
  };
}

export interface WatchResult {
  /** Pedidos cuya oferta por cercanía se amplió al siguiente radio. */
  widened: string[];
  /** Pedidos sin repartidor que se volvieron a ofrecer. */
  nudged: string[];
  /** Pedidos que se quitaron a un repartidor que no avanzó y se ofrecieron a otros. */
  reassigned: string[];
}

/**
 * Vigilancia de los deliveries (como Rappi o PedidosYa):
 * - un pedido listo que nadie toma se vuelve a ofrecer a los repartidores conectados y se avisa a la
 *   tienda (una vez por intervalo, sin llenar de avisos);
 * - un repartidor que tomó un pedido y no lo recoge a tiempo, o cuyo celular deja de mandar ubicación,
 *   lo pierde: el pedido vuelve a ofrecerse a los demás y a él se le avisa.
 */
@Injectable()
export class WatchDeliveriesUseCase {
  /** Último aviso por pedido sin repartidor (en memoria: si el core se reinicia, a lo sumo se repite uno). */
  private readonly nudgedAt = new Map<string, number>();

  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    private readonly events: OrderEvents,
    private readonly notifications: NotificationDispatcher,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
  ) {}

  /** Amplía la oferta y avisa solo a los repartidores que ahora la alcanzan (los de antes ya la tenían). */
  private async widen(order: OrderRecord, now: Date): Promise<boolean> {
    const radius = this.dispatch.next(order.offerRadiusKm);
    const widened = await this.orders.widenOffer(order.id, radius, now);
    if (!widened) return false;
    const online = await this.drivers.listOnline();
    const fresh = online.filter((d) => this.dispatch.canSee(widened, d, radius, now) && !this.dispatch.canSee(order, d, order.offerRadiusKm, now));
    if (fresh.length) {
      const customers = await customersOf(this.users, [widened]);
      for (const d of fresh) this.realtime.toUsers([d.userId], 'driver-order:updated', toDriverOrder(widened, d.userId, customers, this.pay, d.location));
      const offer = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', this.pay.split(order.deliveryFeeCents, order.tipCents).earningsCents);
      void this.notifications.notify(fresh.map((d) => d.userId), () => offer);
    }
    return true;
  }

  async execute(config: DeliveryWatchConfig, now = new Date()): Promise<WatchResult> {
    const result: WatchResult = { widened: [], nudged: [], reassigned: [] };
    const list = await this.orders.listByStatus(['searching_driver', 'driver_assigned'], WATCH_LIMIT);
    const t = now.getTime();

    for (const order of list) {
      if (order.status === 'searching_driver') {
        // Oferta por cercanía: cada oleada sin repartidor amplía el radio (3 → 6 → 12 km → todos).
        if (this.dispatch.waveDue(order, now) && (await this.widen(order, now))) result.widened.push(order.id);
        const waiting = t - since(order, 'searching_driver').getTime();
        const last = this.nudgedAt.get(order.id) ?? 0;
        if (waiting < config.untakenMinutes * MINUTE || t - last < config.untakenMinutes * MINUTE) continue;
        this.nudgedAt.set(order.id, t);
        // Se recuerda a los que alcanza la oleada actual, no a todos.
        const drivers = (await this.drivers.listOnline()).filter((d) => this.dispatch.canSee(order, d, order.offerRadiusKm, now)).map((d) => d.userId);
        const offer = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', this.pay.split(order.deliveryFeeCents, order.tipCents).earningsCents);
        void this.notifications.notify(drivers, () => offer);
        if (order.business) {
          const push = untakenPush(order.id, Math.round(waiting / MINUTE));
          void this.notifications.notify([order.business.ownerId], () => push);
        }
        result.nudged.push(order.id);
        continue;
      }

      // driver_assigned: ¿recogió a tiempo y sigue con señal?
      const assignedAt = since(order, 'driver_assigned').getTime();
      const lastSignal = order.driverLocation ? Math.max(order.driverLocation.at.getTime(), assignedAt) : assignedAt;
      const driverName = order.delivery?.driverName ?? 'El repartidor';
      const reason =
        t - assignedAt >= config.pickupMinutes * MINUTE
          ? `${driverName} no lo recogió en ${config.pickupMinutes} minutos`
          : t - lastSignal >= config.silentMinutes * MINUTE
            ? `${driverName} se quedó sin señal`
            : null;
      if (!reason) continue;
      const updated = await this.orders.updateIfStatus(order.id, 'driver_assigned', {
        status: 'searching_driver',
        driverId: null,
        delivery: null,
        ...(await this.dispatch.openOffer(now)),
        note: `Reasignado automáticamente: ${reason}`,
      });
      if (!updated) continue;
      this.nudgedAt.delete(order.id);
      this.events.changed(updated, order.driverId);
      result.reassigned.push(order.id);
    }

    // Se olvidan los pedidos que ya no esperan repartidor.
    const waitingIds = new Set(list.filter((o) => o.status === 'searching_driver').map((o) => o.id));
    for (const id of this.nudgedAt.keys()) if (!waitingIds.has(id)) this.nudgedAt.delete(id);
    return result;
  }
}

/** Corre la vigilancia cada `DELIVERY_WATCH_INTERVAL_MS` (60 s por defecto; 0 la apaga). */
@Injectable()
export class DeliveryWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DeliveryWatch');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly watch: WatchDeliveriesUseCase,
  ) {}

  onModuleInit(): void {
    const { intervalMs } = this.env.deliveryWatch;
    if (intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { widened, nudged, reassigned } = await this.watch.execute(this.env.deliveryWatch);
      if (widened.length || nudged.length || reassigned.length) {
        this.logger.log(`Ofertas ampliadas: ${widened.length} · reofrecidos: ${nudged.length} · reasignados: ${reassigned.length}`);
      }
    } catch (error) {
      this.logger.error(`La vigilancia de deliveries falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
