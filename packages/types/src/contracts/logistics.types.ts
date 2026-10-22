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
  /**
   * Cómo se reparten los pedidos listos: «optimal» = asignación óptima (algoritmo húngaro con los
   * minutos por las calles de cada repartidor a cada tienda) con oferta exclusiva; «waves» = oleadas
   * por cercanía, el primero que lo toma se lo lleva.
   */
  dispatchMode: DispatchMode;
  /** Segundos que el repartidor elegido tiene para aceptar antes de que pase al siguiente mejor. */
  exclusiveOfferSeconds: number;
}

export type DispatchMode = 'optimal' | 'waves';

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

/** Un pedido del plan, para mostrarlo en su propia tarjeta. */
export interface RoutePlanOrder {
  orderId: string;
  /** Últimos 4 caracteres del id, para nombrarlo («Pedido #A1B2»). */
  shortId: string;
  businessName: string;
  customerName: string;
  dropoffLine: string;
  /** Lo siguiente que tiene que hacer con este pedido. */
  next: 'pickup' | 'dropoff';
  /** Números de parada en el plan (null si esa parada ya pasó o no tiene ubicación). */
  pickupStop: number | null;
  dropoffStop: number | null;
  earningsCents: number;
}

/** Orden óptimo para recoger y entregar los pedidos en curso del repartidor. */
export interface DriverRoutePlan {
  /** Cómo se midieron las distancias: por las calles (tabla de OSRM) o en línea recta × factor. */
  method: 'streets' | 'straight_line';
  orders: RoutePlanOrder[];
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

/** Servicios que se conectan con una API de tienda externa desde el panel de soporte. */
export type IntegrableService = 'tecnologia' | 'ferreteria' | 'salud';

/** El «idioma» de la API de la tienda: el de Parla (como MercaYa) o la API v1 de RED WIIIL. */
export type IntegrationFormat = 'parla' | 'redwiiil';

/** Integración tal como la ve soporte (las claves nunca vuelven completas). */
export interface AdminIntegration {
  service: IntegrableService;
  name: string;
  format: IntegrationFormat;
  enabled: boolean;
  baseUrl: string;
  prefix: string;
  apiKeySet: boolean;
  /** Últimos 4 caracteres de la clave, para reconocerla. */
  apiKeyHint: string | null;
  adminKeySet: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface UpdateIntegrationRequest {
  name: string;
  /** Si no viene, se reconoce por la clave (las de RED WIIIL empiezan con «wiiil_»). */
  format?: IntegrationFormat;
  enabled: boolean;
  baseUrl: string;
  prefix: string;
  /** Vacía o ausente = se conserva la guardada; para quitarla, `clearApiKey`. */
  apiKey?: string;
  clearApiKey?: boolean;
  adminKey?: string;
  clearAdminKey?: boolean;
}

/** Resultado de «Probar conexión» con la API de la tienda. */
export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  products: number;
  /** Algunos nombres del catálogo, para confirmar que es la tienda correcta. */
  sample: string[];
}
