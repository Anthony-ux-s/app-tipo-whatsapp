import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { GeoPoint } from '@parla/types';
import { APP_ENV, type AppEnv } from '../../../../config/env.validation';
import { assignOrders } from '../../../../kernel/assignment';
import { distanceKm } from '../../../../kernel/geo';
import { driverOfferPush } from '../../../../kernel/order-rules';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { STREET_ROUTER, type StreetRouter } from '../../../../infra/routing/street-router.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { DELIVERY_SETTINGS_REPOSITORY, type DeliverySettingsRepository } from '../delivery-settings.repository';
import { DispatchPolicy } from '../dispatch.policy';
import { DriverPayPolicy } from '../driver-pay.policy';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { customersOf, toDriverOrder } from './orders.use-cases';

const SEARCH_LIMIT = 100;
/** Un repartidor que ya va a esa tienda (con otro pedido sin recoger) llega «gratis»: se agrupan. */
const SAME_STORE_MINUTES = 0.5;
/** Más lejos que esto de la tienda no se le asigna (en asignación óptima; las oleadas siguen igual). */
const MAX_PICKUP_KM = 15;

export interface DispatchRound {
  offered: { orderId: string; driverId: string; minutes: number }[];
  /** Pedidos que nadie puede llevar ahora: vuelven a la oferta por oleadas. */
  released: string[];
}

function waitingSince(order: OrderRecord): number {
  const entry = [...order.timeline].reverse().find((t) => t.status === 'searching_driver');
  return entry ? new Date(entry.at).getTime() : order.updatedAt.getTime();
}

const live = (order: OrderRecord, now: Date) => !!order.reservedFor && order.reservedFor.until.getTime() > now.getTime();

/**
 * Asignación óptima (cada pocos segundos): junta los pedidos listos sin reserva vigente y los
 * repartidores libres, pide al servidor de rutas la tabla de minutos por las calles de cada
 * repartidor a cada tienda y elige el reparto de menor tiempo total (algoritmo húngaro). Cada pedido
 * se reserva solo para su repartidor por unos segundos; si no lo acepta, pasa al siguiente mejor, y
 * si ya nadie puede, vuelve a la oferta por oleadas.
 */
@Injectable()
export class OptimalDispatchUseCase {
  /** Repartidores que dejaron vencer la oferta de cada pedido (no se les vuelve a ofrecer ese). */
  private readonly passed = new Map<string, Set<string>>();

  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    @Inject(STREET_ROUTER) private readonly router: StreetRouter,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationDispatcher,
    private readonly dispatch: DispatchPolicy,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(now = new Date()): Promise<DispatchRound> {
    const round: DispatchRound = { offered: [], released: [] };
    const { pricing } = await this.settings.get();
    const searching = (await this.orders.listByStatus(['searching_driver'], SEARCH_LIMIT)).filter((o) => !o.driverId);
    for (const id of this.passed.keys()) if (!searching.some((o) => o.id === id)) this.passed.delete(id);
    if (pricing.dispatchMode !== 'optimal') return round;

    // Ofertas vencidas sin respuesta: ese repartidor no lo quiso (o no lo vio a tiempo).
    for (const o of searching) {
      const r = o.reservedFor;
      if (r?.driverId && !live(o, now)) this.passed.set(o.id, new Set([...(this.passed.get(o.id) ?? []), r.driverId]));
    }
    // Los que ya tienen una oferta vigente la esperan; se reparten los demás (incluidos los retenidos).
    const pending = searching.filter((o) => !(live(o, now) && o.reservedFor?.driverId));
    if (!pending.length) return round;
    const offeredTo = new Set(searching.filter((o) => live(o, now) && o.reservedFor?.driverId).map((o) => o.reservedFor!.driverId!));

    const maxAge = this.dispatch.config.locationMaxAgeMinutes * 60_000;
    const candidates = (await this.drivers.listOnline()).filter(
      (d): d is DriverRecord & { location: NonNullable<DriverRecord['location']> } =>
        !!d.location && now.getTime() - d.location.at.getTime() <= maxAge && !offeredTo.has(d.userId),
    );
    const actives = await Promise.all(candidates.map((d) => this.orders.listActiveForDriver(d.userId)));

    // Tabla de minutos por las calles: repartidores × tiendas (una sola consulta al servidor de rutas).
    const stores: GeoPoint[] = [];
    const storeIndex = new Map<string, number>();
    for (const o of pending) {
      const s = o.business?.location;
      if (!s || storeIndex.has(`${s.lat},${s.lng}`)) continue;
      storeIndex.set(`${s.lat},${s.lng}`, stores.length);
      stores.push(s);
    }
    const table = candidates.length && stores.length ? await this.router.matrix(candidates.map((d) => d.location), stores) : null;
    const byId = new Map(pending.map((o) => [o.id, o]));
    const driverIndex = new Map(candidates.map((d, i) => [d.userId, i]));

    const pairs = assignOrders(
      pending.map((o) => ({ id: o.id, waitingMinutes: (now.getTime() - waitingSince(o)) / 60_000 })),
      candidates.map((d, i) => ({ id: d.userId, load: actives[i].length, capacity: pricing.maxActiveOrders })),
      (ao, ad) => {
        const order = byId.get(ao.id)!;
        const store = order.business?.location;
        const i = driverIndex.get(ad.id)!;
        if (!store || this.passed.get(order.id)?.has(ad.id)) return null;
        const straight = distanceKm(candidates[i].location, store);
        if (straight > MAX_PICKUP_KM) return null;
        // Ya va a esa tienda por otro pedido: se lo suma al viaje.
        if (actives[i].some((a) => a.status === 'driver_assigned' && a.business?.id === order.business?.id)) return SAME_STORE_MINUTES;
        const street = table?.minutes[i][storeIndex.get(`${store.lat},${store.lng}`)!];
        return street ?? (straight * pricing.streetFactor * 60) / pricing.avgSpeedKmh[candidates[i].vehicle];
      },
    );

    const until = new Date(now.getTime() + pricing.exclusiveOfferSeconds * 1000);
    for (const pair of pairs) {
      const reserved = await this.orders.reserveOffer(pair.orderId, { driverId: pair.driverId, until });
      if (!reserved) continue;
      round.offered.push(pair);
      await this.offer(reserved, pair.driverId);
    }
    // Retenidos que nadie puede llevar ahora (sin repartidores cerca, o todos lo dejaron pasar): a las oleadas.
    for (const o of pending) {
      if (round.offered.some((p) => p.orderId === o.id) || !o.reservedFor) continue;
      const released = await this.orders.reserveOffer(o.id, null);
      if (!released) continue;
      round.released.push(o.id);
      await this.broadcast(released, now);
    }
    return round;
  }

  /** Avisa al repartidor elegido: aparece en sus pedidos y le llega la notificación. */
  private async offer(order: OrderRecord, driverId: string): Promise<void> {
    const driver = await this.drivers.findByUser(driverId);
    const customers = await customersOf(this.users, [order]);
    this.realtime.toUsers([driverId], 'driver-order:updated', toDriverOrder(order, driverId, customers, this.pay, driver?.location ?? null));
    const push = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', this.pay.split(order.deliveryFeeCents, order.tipCents).earningsCents);
    void this.notifications.notify([driverId], () => ({ ...push, title: `Para ti · ${push.title}` }));
  }

  /** Sin repartidor elegido: se ofrece como siempre a los que alcanza la oleada. */
  private async broadcast(order: OrderRecord, now: Date): Promise<void> {
    const reached = (await this.drivers.listOnline()).filter((d) => this.dispatch.canSee(order, d, order.offerRadiusKm, now));
    if (!reached.length) return;
    const customers = await customersOf(this.users, [order]);
    for (const d of reached) this.realtime.toUsers([d.userId], 'driver-order:updated', toDriverOrder(order, d.userId, customers, this.pay, d.location));
    const push = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', this.pay.split(order.deliveryFeeCents, order.tipCents).earningsCents);
    void this.notifications.notify(reached.map((d) => d.userId), () => push);
  }
}

/** Corre la asignación óptima cada 5 s (apagada si la vigilancia de deliveries está apagada, p. ej. en pruebas). */
@Injectable()
export class OptimalDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AsignacionOptima');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly dispatch: OptimalDispatchUseCase,
  ) {}

  onModuleInit(): void {
    if (this.env.deliveryWatch.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { offered, released } = await this.dispatch.execute();
      for (const p of offered) this.logger.log(`Pedido ${p.orderId} → repartidor ${p.driverId} (${p.minutes.toFixed(1)} min a la tienda)`);
      if (released.length) this.logger.log(`Sin repartidor para ${released.length} pedido(s): se ofrecen por oleadas`);
    } catch (error) {
      this.logger.error(`La asignación óptima falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
