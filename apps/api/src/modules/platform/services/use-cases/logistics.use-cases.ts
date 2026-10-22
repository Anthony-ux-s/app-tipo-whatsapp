import { Inject, Injectable } from '@nestjs/common';
import type {
  DeliveryPricing,
  DeliveryQuoteBreakdown,
  DeliverySettings,
  DeliveryQuoteSimulation,
  DriverRoutePlan,
  DriverRoutesSummary,
  DriverVehicle,
  GeoPoint,
  RoutePlanOrder,
  RouteStop,
} from '@parla/types';
import { assertDeliveryPricing, fuelGallons, priceDelivery, travelMinutes } from '../../../../kernel/delivery-pricing';
import { NotFoundError } from '../../../../kernel/domain-error';
import { assertPoint, distanceKm } from '../../../../kernel/geo';
import { planRoute, routeKm, type DistanceFn, type PlanStop } from '../../../../kernel/route-planning';
import { STREET_ROUTER, type StreetRouter } from '../../../../infra/routing/street-router.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { DELIVERY_SETTINGS_REPOSITORY, type DeliverySettingsRepository } from '../delivery-settings.repository';
import { DriverPayPolicy } from '../driver-pay.policy';
import { DRIVERS_REPOSITORY, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { requireAdmin } from './claims.use-cases';
import { customersOf } from './orders.use-cases';

/** Lo que de verdad gasta el repartidor en combustible (sin el margen que se cobra al cliente). */
function fuelSpendCents(p: DeliveryPricing, vehicle: DriverVehicle, km: number): number {
  return Math.round(fuelGallons(p, vehicle, km) * p.fuelPriceCentsPerGallon);
}

/**
 * Cotiza un delivery con la tarifa de soporte: distancia por las calles (OSRM) o, si no responde,
 * línea recta × factor de calles; sin las dos ubicaciones, tarifa plana.
 */
@Injectable()
export class QuoteDeliveryUseCase {
  constructor(
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    @Inject(STREET_ROUTER) private readonly router: StreetRouter,
  ) {}

  async execute(pickup: GeoPoint | null, dropoff: GeoPoint | null, options: { vehicle?: DriverVehicle; pricing?: DeliveryPricing } = {}): Promise<DeliveryQuoteBreakdown> {
    const pricing = options.pricing ?? (await this.settings.get()).pricing;
    if (!pickup || !dropoff) return priceDelivery(pricing, { distanceKm: null, method: 'flat', vehicle: options.vehicle });
    assertPoint(pickup);
    assertPoint(dropoff);
    const straight = distanceKm(pickup, dropoff);
    const street = pricing.useStreetRouting ? await this.router.route([pickup, dropoff]) : null;
    if (street) {
      return priceDelivery(pricing, { distanceKm: street.distanceKm, straightLineKm: straight, method: 'streets', streetMinutes: street.minutes, vehicle: options.vehicle, path: street.path });
    }
    return priceDelivery(pricing, { distanceKm: straight * pricing.streetFactor, straightLineKm: straight, method: 'straight_line', vehicle: options.vehicle });
  }
}

/** Soporte: la tarifa vigente, quién la cambió y cuándo. */
@Injectable()
export class GetDeliverySettingsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
  ) {}

  async execute(adminId: string): Promise<DeliverySettings> {
    await requireAdmin(this.users, adminId);
    const stored = await this.settings.get();
    const [by] = stored.updatedById ? await this.users.findActiveByIds([stored.updatedById]) : [];
    return { ...stored.pricing, updatedAt: stored.updatedAt?.toISOString() ?? null, updatedByName: by?.displayName ?? null };
  }
}

/** Soporte cambia la tarifa: vale para las cotizaciones siguientes (los pedidos ya pagados no cambian). */
@Injectable()
export class UpdateDeliverySettingsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    private readonly get: GetDeliverySettingsUseCase,
  ) {}

  async execute(adminId: string, pricing: DeliveryPricing): Promise<DeliverySettings> {
    await requireAdmin(this.users, adminId);
    assertDeliveryPricing(pricing);
    await this.settings.save(pricing, adminId);
    return this.get.execute(adminId);
  }
}

/** Soporte prueba una tarifa (la guardada o la que está editando) entre dos puntos del mapa. */
@Injectable()
export class SimulateDeliveryQuoteUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly quote: QuoteDeliveryUseCase,
  ) {}

  async execute(adminId: string, sim: DeliveryQuoteSimulation): Promise<DeliveryQuoteBreakdown> {
    await requireAdmin(this.users, adminId);
    if (sim.pricing) assertDeliveryPricing(sim.pricing);
    return this.quote.execute(sim.pickup, sim.dropoff, { vehicle: sim.vehicle, pricing: sim.pricing });
  }
}

type PlannedStop = PlanStop & { label: string };

/** Paradas que le faltan a un pedido en curso: recoger (si aún no lo recogió) y entregar. */
function stopsOf(order: OrderRecord): PlannedStop[] {
  const stops: PlannedStop[] = [];
  const store = order.business?.location;
  const home = order.address.location;
  if (order.status === 'driver_assigned' && store) stops.push({ orderId: order.id, kind: 'pickup', point: store, label: `Recoger en ${order.business?.name ?? 'la tienda'}` });
  if (home) stops.push({ orderId: order.id, kind: 'dropoff', point: home, label: `Entregar en ${order.address.line}` });
  return stops;
}

/**
 * El mejor orden para los pedidos en curso del repartidor, desde donde está: recoger antes de
 * entregar y el menor recorrido (ver kernel/route-planning).
 */
@Injectable()
export class DriverRoutePlanUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    @Inject(STREET_ROUTER) private readonly router: StreetRouter,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string): Promise<DriverRoutePlan> {
    const driver = await this.drivers.findByUser(userId);
    if (!driver) throw new NotFoundError('Primero regístrate como repartidor');
    const { pricing } = await this.settings.get();
    const active = (await this.orders.listActiveForDriver(userId)).filter((o) => o.status === 'driver_assigned' || o.status === 'on_the_way');
    const stops = active.flatMap(stopsOf);
    const start = driver.location ? { lat: driver.location.lat, lng: driver.location.lng } : null;
    const table = await streetDistances(this.router, [...(start ? [start] : []), ...stops.map((s) => s.point)], pricing.streetFactor);
    const plan = planRoute(start, stops, table.km);
    const round = (km: number) => Math.round(km * 100) / 100;
    const planned: RouteStop[] = plan.stops.map((s, i) => ({ orderId: s.orderId, kind: s.kind, label: s.label, point: s.point, legKm: round(plan.legsKm[i]) }));
    const stopNumber = (orderId: string, kind: 'pickup' | 'dropoff') => {
      const i = plan.stops.findIndex((s) => s.orderId === orderId && s.kind === kind);
      return i >= 0 ? i + 1 : null;
    };
    const customers = await customersOf(this.users, active);
    const orders: RoutePlanOrder[] = active
      .map((o) => ({
        orderId: o.id,
        shortId: o.id.slice(-4).toUpperCase(),
        businessName: o.business?.name ?? 'Tienda',
        customerName: customers.get(o.userId)?.displayName ?? 'Cliente',
        dropoffLine: o.address.line,
        next: o.status === 'driver_assigned' ? ('pickup' as const) : ('dropoff' as const),
        pickupStop: stopNumber(o.id, 'pickup'),
        dropoffStop: stopNumber(o.id, 'dropoff'),
        earningsCents: this.pay.split(o.deliveryFeeCents, o.tipCents).earningsCents,
      }))
      // En el orden en que aparecen en la ruta.
      .sort((a, b) => (a.pickupStop ?? a.dropoffStop ?? 99) - (b.pickupStop ?? b.dropoffStop ?? 99));
    return {
      method: table.streets ? 'streets' : 'straight_line',
      orders,
      start,
      vehicle: driver.vehicle,
      stops: planned,
      totalKm: round(plan.totalKm),
      etaMinutes: stops.length ? travelMinutes(pricing, driver.vehicle, plan.totalKm) + pricing.handlingMinutes * Math.max(0, active.length - 1) : 0,
      fuelCents: fuelSpendCents(pricing, driver.vehicle, plan.totalKm),
      // Frente a hacer cada pedido completo, uno detrás de otro, en el orden en que se tomaron.
      savedKm: Math.max(0, round(routeKm(start, stops, table.km) - plan.totalKm)),
    };
  }
}

/**
 * Distancias por las calles entre todos los puntos con una sola consulta (tabla de OSRM: caminos
 * más cortos con Dijkstra). Si no responde, línea recta × factor de calles.
 */
async function streetDistances(router: StreetRouter, points: GeoPoint[], streetFactor: number): Promise<{ km: DistanceFn; streets: boolean }> {
  const straight: DistanceFn = (a, b) => distanceKm(a, b) * streetFactor;
  if (points.length < 2) return { km: straight, streets: false };
  const index = new Map(points.map((p, i) => [`${p.lat},${p.lng}`, i]));
  const table = await router.matrix(points, points);
  if (!table) return { km: straight, streets: false };
  const km: DistanceFn = (a, b) => {
    const i = index.get(`${a.lat},${a.lng}`);
    const j = index.get(`${b.lat},${b.lng}`);
    const v = i === undefined || j === undefined ? null : table.km[i][j];
    return v ?? straight(a, b);
  };
  return { km, streets: true };
}

const HISTORY_LIMIT = 300;
/** Más que esto, en un pedido sin punto de recojo guardado, no es una entrega real sino una tienda que se mudó. */
const LEGACY_MAX_KM = 100;

/** Historial de entregas del repartidor con su recorrido, lo que ganó y lo que gastó en combustible. */
@Injectable()
export class DriverRoutesHistoryUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings: DeliverySettingsRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string, days: number, now = new Date()): Promise<DriverRoutesSummary> {
    const driver = await this.drivers.findByUser(userId);
    if (!driver) throw new NotFoundError('Primero regístrate como repartidor');
    const { pricing } = await this.settings.get();
    const since = now.getTime() - days * 86_400_000;
    const delivered = (await this.orders.listForDriver(userId, HISTORY_LIMIT)).filter((o) => o.status === 'delivered');
    const routes = delivered
      .map((o) => {
        const deliveredAt = [...o.timeline].reverse().find((t) => t.status === 'delivered')?.at ?? o.updatedAt.toISOString();
        // Desde donde se recogió de verdad (si la tienda se mudó después, el historial no cambia).
        const pickup = o.pickup ?? o.business?.location ?? null;
        const dropoff = o.address.location ?? null;
        const measured = pickup && dropoff ? distanceKm(pickup, dropoff) * pricing.streetFactor : null;
        // Pedidos viejos sin el punto de recojo guardado: si la tienda se mudó, la cuenta saldría absurda.
        const km = measured !== null && !o.pickup && measured > LEGACY_MAX_KM ? null : measured;
        return {
          orderId: o.id,
          businessName: o.business?.name ?? 'Tienda',
          pickup,
          dropoff,
          dropoffLine: o.address.line,
          distanceKm: km === null ? null : Math.round(km * 100) / 100,
          earningsCents: this.pay.split(o.deliveryFeeCents, o.tipCents).earningsCents,
          fuelCents: km === null ? 0 : fuelSpendCents(pricing, driver.vehicle, km),
          deliveredAt,
        };
      })
      .filter((r) => new Date(r.deliveredAt).getTime() >= since)
      .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
    return {
      routes,
      totalKm: Math.round(routes.reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 100) / 100,
      earningsCents: routes.reduce((s, r) => s + r.earningsCents, 0),
      fuelCents: routes.reduce((s, r) => s + r.fuelCents, 0),
      vehicle: driver.vehicle,
    };
  }
}
