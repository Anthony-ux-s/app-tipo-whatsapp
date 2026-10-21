import type { DriverVehicle, GeoPoint } from './services.types';

/**
 * Tarifa del delivery que configura soporte: base + por km + combustible del vehículo con el que se
 * cotiza, entre un mínimo y un máximo (redondeado a 10 céntimos).
 */
export interface DeliveryPricing {
  baseFeeCents: number;
  perKmCents: number;
  minFeeCents: number;
  maxFeeCents: number;
  /** Sin la ubicación de la tienda o del cliente no hay distancia: tarifa plana. */
  flatFeeCents: number;
  /** Precio del galón de combustible (en Perú se vende por galón). */
  fuelPriceCentsPerGallon: number;
  /** Cuánto se suma sobre el costo del combustible (desgaste, aceite, margen), en %. */
  fuelMarginPercent: number;
  /** Rendimiento de cada vehículo (km por galón; 0 = no usa combustible). */
  kmPerGallon: Record<DriverVehicle, number>;
  /** Velocidad promedio en la ciudad (km/h), para la hora estimada. */
  avgSpeedKmh: Record<DriverVehicle, number>;
  /** Vehículo con el que se cotiza al cliente. */
  pricingVehicle: DriverVehicle;
  /** Calcular la distancia por las calles (OSRM); si no responde, línea recta × factor de calles. */
  useStreetRouting: boolean;
  /** Cuánto más largo es ir por las calles que en línea recta (1.35 = 35 % más). */
  streetFactor: number;
  /** Minutos fijos de la hora estimada (recoger y entregar). */
  handlingMinutes: number;
  /** Pedidos que un repartidor puede llevar a la vez (1 = uno por viaje; más = la ruta los ordena). */
  maxActiveOrders: number;
}

export interface DeliverySettings extends DeliveryPricing {
  updatedAt: string | null;
  updatedByName: string | null;
}

/** Cómo se calculó la distancia: por las calles o en línea recta con el factor de calles. */
export type DistanceMethod = 'streets' | 'straight_line' | 'flat';

/** Desglose de una cotización (lo ve soporte al simular y el repartidor en sus rutas). */
export interface DeliveryQuoteBreakdown {
  feeCents: number;
  baseCents: number;
  distanceCents: number;
  fuelCents: number;
  /** Galones que gasta el vehículo en el recorrido. */
  fuelGallons: number;
  distanceKm: number;
  straightLineKm: number;
  etaMinutes: number;
  method: DistanceMethod;
  vehicle: DriverVehicle;
  /** El recorrido por las calles (si se calculó), para dibujarlo. */
  path: GeoPoint[] | null;
}

export interface DeliveryQuoteSimulation {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  vehicle?: DriverVehicle;
  /** Para probar una tarifa antes de guardarla. */
  pricing?: DeliveryPricing;
}

/** Una parada del plan del repartidor. */
export interface RouteStop {
  orderId: string;
  kind: 'pickup' | 'dropoff';
  label: string;
  point: GeoPoint;
  /** Km desde la parada anterior (o desde el repartidor). */
  legKm: number;
}

/** Orden óptimo para recoger y entregar los pedidos en curso del repartidor. */
export interface DriverRoutePlan {
  start: GeoPoint | null;
  /** Vehículo del repartidor (su ícono en el mapa). */
  vehicle: DriverVehicle;
  stops: RouteStop[];
  totalKm: number;
  etaMinutes: number;
  fuelCents: number;
  /** Km que se ahorran frente a hacerlos en el orden en que se tomaron. */
  savedKm: number;
}

/** Una entrega del historial del repartidor, con su recorrido. */
export interface DriverRouteEntry {
  orderId: string;
  businessName: string;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  dropoffLine: string;
  distanceKm: number | null;
  earningsCents: number;
  fuelCents: number;
  deliveredAt: string;
}

export interface DriverRoutesSummary {
  routes: DriverRouteEntry[];
  totalKm: number;
  earningsCents: number;
  fuelCents: number;
  vehicle: DriverVehicle;
}

/** Tipo de cuenta para el panel de personas. */
export type PersonRole = 'client' | 'driver' | 'business' | 'admin';

export interface AdminPerson {
  id: string;
  displayName: string;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  avatarColor: string;
  roles: PersonRole[];
  /** Verificación del repartidor, si reparte. */
  driverStatus: string | null;
  businessName: string | null;
  orders: number;
  deliveries: number;
  /** Veces que abrió la app en los últimos 30 días. */
  visits30d: number;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  blockedAt: string | null;
  blockedReason: string | null;
}

export type AdminPeopleFilter = 'all' | 'clients' | 'drivers' | 'businesses' | 'blocked';

export interface TrafficDay {
  /** AAAA-MM-DD (hora de Lima). */
  day: string;
  visits: number;
  uniqueUsers: number;
  signups: number;
  orders: number;
}

export interface TrafficTopUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: string;
  roles: PersonRole[];
  visits: number;
  activeDays: number;
}

export interface AdminTraffic {
  days: TrafficDay[];
  totals: {
    users: number;
    clients: number;
    drivers: number;
    driversOnline: number;
    businesses: number;
    blocked: number;
    onlineNow: number;
    activeToday: number;
    visits: number;
    signups: number;
    orders: number;
  };
  topUsers: TrafficTopUser[];
}
