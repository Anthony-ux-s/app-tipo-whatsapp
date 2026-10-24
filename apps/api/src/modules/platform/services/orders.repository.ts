import type {
  Currency,
  DeliveryAddress,
  GeoPoint,
  OrderBusiness,
  OrderDelivery,
  OrderLine,
  OrderPayment,
  OrderRating,
  RatingSummary,
  OrderStatus,
  OrderTimelineEntry,
} from '@parla/types';
import type { ClaimRecord } from './claims.repository';

/** Pedido tal como lo ven los casos de uso (sin tipos de Prisma). */
export interface OrderRecord {
  id: string;
  userId: string;
  /** Clave de la tienda que lo prepara (el id de la tienda). */
  service: string;
  /** Negocio que prepara el pedido (con su dueño y dirección); null en pedidos sin negocio. */
  business: OrderBusiness | null;
  /** Dónde se recogió: la ubicación de la tienda cuando se creó el pedido (null en pedidos viejos). */
  pickup: GeoPoint | null;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  /** Propina para el repartidor (incluida en el total). */
  tipCents: number;
  /** Descuento del cupón (ya restado del total) y su código; al crear se registra su uso. */
  discountCents: number;
  couponCode: string | null;
  totalCents: number;
  currency: Currency;
  address: DeliveryAddress;
  payment: OrderPayment;
  deliveryQuoteId: string;
  /** Minutos que Rapidito estimó para el envío. */
  etaMinutes: number;
  delivery: OrderDelivery | null;
  /** Repartidor de Rapidito que lo tomó; null mientras nadie lo toma. */
  driverId: string | null;
  /** Última ubicación de ese repartidor (para el mapa); null si no mandó ninguna. */
  driverLocation: (GeoPoint & { at: Date }) | null;
  /** Código de entrega: solo lo ve el cliente. */
  deliveryCode: string;
  deliveryCodeAttempts: number;
  timeline: OrderTimelineEntry[];
  /** Calificación del cliente al recibirlo; null si aún no califica. */
  rating: OrderRating | null;
  /** Oferta por cercanía: radio actual (null = a todos) y desde cuándo. */
  offerRadiusKm: number | null;
  offerWaveAt: Date | null;
  /**
   * Asignación óptima: reservado para un repartidor hasta `until` (solo él lo ve). Con `driverId`
   * null, retenido mientras se decide a quién dárselo. null = sin reserva.
   */
  reservedFor: OfferReservation | null;
  deliveryPhotoId: string | null;
  deliveredWithoutCode: boolean;
  /** Reclamos del pedido, el último primero. */
  claims: ClaimRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewOrder = Omit<
  OrderRecord,
  'createdAt' | 'updatedAt' | 'delivery' | 'business' | 'driverId' | 'driverLocation' | 'deliveryCodeAttempts' | 'timeline' | 'rating' | 'offerRadiusKm' | 'offerWaveAt' | 'reservedFor' | 'deliveryPhotoId' | 'deliveredWithoutCode' | 'claims'
> & { businessId: string | null; pickup?: GeoPoint | null };

export interface OfferReservation {
  driverId: string | null;
  until: Date;
}

export interface OrderChanges {
  status: OrderStatus;
  payment?: OrderPayment;
  /** null quita al repartidor (lo soltó o la tienda pidió otro). */
  delivery?: OrderDelivery | null;
  driverId?: string | null;
  /** Al quedar listo (o volver a ofrecerse): primera oleada de la oferta por cercanía. */
  offer?: { radiusKm: number | null; at: Date };
  /** Reserva de la asignación óptima (null la quita). */
  reservation?: OfferReservation | null;
  deliveryPhotoId?: string;
  deliveredWithoutCode?: boolean;
  /**
   * Detalle del paso para la línea de tiempo (p. ej. quién lo entregó y cómo se confirmó). Con el
   * mismo estado (p. ej. una devolución después de cancelar) se anota igual.
   */
  note?: string;
}

/** Búsqueda de soporte: por estado y por id del pedido o nombre del cliente. */
export interface AdminOrderFilter {
  statuses?: OrderStatus[];
  query?: string;
  limit: number;
}

export interface OrdersRepository {
  create(order: NewOrder): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  listForUser(userId: string, limit: number): Promise<OrderRecord[]>;
  /** Pedidos que atiende un negocio, ya pagados (los que esperan pago no le conciernen). */
  listForBusiness(businessId: string, limit: number): Promise<OrderRecord[]>;
  /** Pedidos listos para recoger que ningún repartidor tomó todavía. */
  listAvailableForDrivers(limit: number): Promise<OrderRecord[]>;
  listForDriver(driverId: string, limit: number): Promise<OrderRecord[]>;
  /** Entregas en curso del repartidor (tomadas y aún no entregadas). */
  countActiveForDriver(driverId: string): Promise<number>;
  listActiveForDriver(driverId: string): Promise<OrderRecord[]>;
  /**
   * Aplica el cambio solo si el pedido sigue en `expected` (comparar y cambiar atómico) y, si cambia
   * de estado, lo anota en la línea de tiempo. Devuelve el pedido actualizado, o null si otro cambio
   * ya lo movió.
   */
  updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null>;
  /** Suma un intento fallido del código de entrega y devuelve cuántos van. */
  addFailedCodeAttempt(id: string): Promise<number>;
  /** Código de entrega nuevo, con los intentos en cero (lo pide el cliente si se bloqueó). */
  resetDeliveryCode(id: string, code: string): Promise<OrderRecord>;
  /** Pedidos en estos estados (para la vigilancia de los deliveries), del más viejo al más nuevo. */
  listByStatus(statuses: OrderStatus[], limit: number): Promise<OrderRecord[]>;
  /** Reserva (o libera, con null) un pedido que sigue sin repartidor para la asignación óptima. */
  reserveOffer(id: string, reservation: OfferReservation | null): Promise<OrderRecord | null>;
  /** Amplía la oferta de un pedido que sigue sin repartidor (no cambia su estado). */
  widenOffer(id: string, radiusKm: number | null, at: Date): Promise<OrderRecord | null>;
  /** Guarda la calificación (solo si aún no tenía). Devuelve null si ya estaba calificado. */
  rate(id: string, rating: Omit<OrderRating, 'at'>, at: Date): Promise<OrderRecord | null>;
  /** Para soporte: todos los pedidos (los más recientes primero), con filtro. */
  search(filter: AdminOrderFilter): Promise<OrderRecord[]>;
  /** Promedio de estrellas de un repartidor o de una tienda. */
  ratingSummary(of: { driverId: string } | { businessId: string }): Promise<RatingSummary>;
  /** La calificación de varias tiendas en una sola consulta (la lista de tiendas no pregunta una por una). */
  ratingSummaries(businessIds: string[]): Promise<Map<string, RatingSummary>>;
}

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');
