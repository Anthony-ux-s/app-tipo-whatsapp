/**
 * Servicios dentro de Parla (estilo WeChat): el cliente compra en sistemas externos (tienda,
 * delivery, pagos) sin salir del chat. El gateway traduce cada API externa a estos contratos.
 * Montos siempre en céntimos (enteros) para no perder precisión.
 */

export type ServiceId = 'mercado' | 'salud';

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  description: string;
  /** Sistema externo que lo atiende (p. ej. «MercaYa»). */
  provider: string;
  available: boolean;
}

export type Currency = 'PEN';

export interface Product {
  id: string;
  name: string;
  /** Presentación: «1 kg», «750 ml»… */
  unit: string;
  priceCents: number;
  currency: Currency;
  stock: number;
  category: string;
  imageUrl: string | null;
  /** Precio normal cuando el producto está en oferta (priceCents es el rebajado). */
  listPriceCents?: number;
}

export interface CartItemRequest {
  productId: string;
  quantity: number;
}

/** Un punto en el mapa (grados decimales, WGS84). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryAddress {
  line: string;
  reference: string;
  /** Dónde lo marcó el cliente en el mapa (opcional: sin esto el mapa no muestra el destino). */
  location?: GeoPoint | null;
}

export interface QuoteRequest {
  items: CartItemRequest[];
  address: DeliveryAddress;
}

export interface OrderLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface OrderQuote {
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: Currency;
  etaMinutes: number;
}

/**
 * Pagado → el negocio lo acepta (preparing) o lo rechaza (rejected) → listo: se ofrece a los
 * repartidores de Rapidito (searching_driver) → uno lo toma y va a la tienda (driver_assigned) → la
 * tienda se lo entrega y va al cliente (on_the_way) → entregado con el código del cliente.
 */
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'preparing'
  | 'rejected'
  | 'searching_driver'
  | 'driver_assigned'
  | 'on_the_way'
  | 'delivered'
  | 'payment_expired'
  | 'cancelled';

export interface OrderPayment {
  provider: string;
  /** Id del cobro en la billetera, para anularlo o devolverlo. */
  chargeId?: string;
  /** Texto que va dentro del QR (en el simulador es la URL de pago). */
  qrText: string;
  payUrl: string;
  expiresAt: string;
  paidAt: string | null;
  /** Cuándo se devolvió el pago (pedido cancelado o rechazado); null si no se devolvió. */
  refundedAt?: string | null;
}

export interface OrderDelivery {
  provider: string;
  driverName: string | null;
  vehicle: string | null;
  etaMinutes: number | null;
  updatedAt: string;
}

/** Cada paso del pedido con su hora: la constancia que ven el cliente y el negocio. */
export interface OrderTimelineEntry {
  status: OrderStatus;
  at: string;
  /** Detalle del paso (p. ej. «Confirmado con el código del cliente · Carlos Huamán»). */
  note?: string;
}

/** Negocio que atiende un servicio (p. ej. la tienda del Mercado) y su dueño en Parla. */
export interface BusinessInfo {
  id: string;
  name: string;
  service: ServiceId;
  /** El dueño puede pausar los pedidos aunque esté en horario. */
  acceptingOrders: boolean;
  /** Horario de atención, hora de Lima («HH:MM»). */
  opensAt: string;
  closesAt: string;
}

/** Si un negocio recibe pedidos ahora (lo ve el cliente antes de pagar). */
export interface BusinessStatus {
  name: string;
  open: boolean;
  /** Por qué no recibe pedidos (pausado o fuera de horario); null si está abierto. */
  closedMessage: string | null;
  opensAt: string;
  closesAt: string;
}

export interface UpdateBusinessRequest {
  acceptingOrders?: boolean;
  opensAt?: string;
  closesAt?: string;
}

/** Cambio de un producto del catálogo de la tienda (lo hace el dueño). */
export interface UpdateCatalogProductRequest {
  priceCents?: number;
  /** Precio normal para mostrarlo en oferta; null quita la oferta. */
  listPriceCents?: number | null;
  stock?: number;
}

export interface OrderBusiness {
  id: string;
  name: string;
  /** Cuenta del dueño en Parla, para escribirle por chat. */
  ownerId: string;
  /** Dónde recoge el repartidor. */
  address: string;
  location: GeoPoint | null;
}

export interface Order {
  id: string;
  service: ServiceId;
  /** Negocio que prepara el pedido; null en pedidos sin negocio asignado. */
  business: OrderBusiness | null;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: Currency;
  address: DeliveryAddress;
  payment: OrderPayment;
  delivery: OrderDelivery | null;
  timeline: OrderTimelineEntry[];
  /**
   * Código de entrega (como el PIN de Rappi): solo lo recibe el cliente, y se lo dicta al repartidor al
   * recibir el pedido. Sin él no se puede marcar como entregado.
   */
  deliveryCode?: string;
  /** Se equivocaron 5 veces con el código: el cliente puede generar uno nuevo. */
  deliveryCodeLocked?: boolean;
  /** Última ubicación del repartidor mientras lo lleva (cliente y tienda); null sin señal aún. */
  driverLocation?: DriverLocation | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderCustomer {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
}

/** Pedido tal como lo ve el dueño del negocio: con quién lo pidió, para atenderlo y escribirle. */
export interface BusinessOrder extends Order {
  customer: OrderCustomer;
}

export type DriverVehicle = 'Moto' | 'Bicicleta' | 'Auto' | 'A pie';

/** Repartidor de Rapidito (cuenta de Parla con su vehículo). */
export interface DriverInfo {
  vehicle: DriverVehicle;
  /** Vacío para bicicleta o a pie. */
  plate: string;
  /** Conectado: recibe ofertas y puede tomar pedidos. */
  online: boolean;
}

/** Alta o cambio del perfil de repartidor. */
export interface DriverProfileRequest {
  vehicle: DriverVehicle;
  plate?: string;
}

/** Lo que lleva ganado un repartidor (las tarifas de delivery de sus entregas). */
export interface DriverEarnings {
  todayCents: number;
  todayDeliveries: number;
  weekCents: number;
  weekDeliveries: number;
  totalCents: number;
  totalDeliveries: number;
}

/** Ubicación del repartidor durante una entrega (la ven el cliente y la tienda de ese pedido). */
export interface DriverLocation extends GeoPoint {
  orderId: string;
  at: string;
}

/** Pedido tal como lo ve un repartidor: qué recoge, dónde, adónde lo lleva y cuánto gana. */
export interface DriverOrder {
  id: string;
  status: OrderStatus;
  business: { name: string; address: string; location: GeoPoint | null };
  /** Adónde lo lleva. */
  address: DeliveryAddress;
  customerName: string;
  lines: OrderLine[];
  /** Lo que gana el repartidor por la entrega (la tarifa de delivery). */
  deliveryFeeCents: number;
  /** Lo tiene este repartidor (si no, es una oferta disponible). */
  mine: boolean;
  timeline: OrderTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DriverOrders {
  /** Listos para recoger, sin repartidor. */
  available: DriverOrder[];
  /** Los que tomó este repartidor (en curso y entregados). */
  mine: DriverOrder[];
}

export interface DeliverOrderRequest {
  code: string;
}

/** Con quién chatear sobre un pedido. */
export type OrderContactRole = 'business' | 'customer' | 'driver';

/** Respuesta al crear un pedido: el pedido y el QR para pagarlo. */
export type CreateOrderRequest = QuoteRequest;

// ── Contratos internos gateway ↔ core (no salen del backend) ──────────────────

export interface InternalCreateOrder {
  id: string;
  userId: string;
  service: ServiceId;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: Currency;
  address: DeliveryAddress;
  payment: OrderPayment;
  /** Cotización del delivery con la que se calculó la tarifa. */
  deliveryQuoteId: string;
  /** Minutos que Rapidito estima para el envío (para la hora estimada de llegada). */
  etaMinutes: number;
}

export interface InternalUpdateOrder {
  /** Solo se aplica si el pedido está en este estado (transiciones idempotentes). */
  expectStatus?: OrderStatus;
  status: OrderStatus;
  paidAt?: string;
  /** Pago devuelto (al cancelar o rechazar un pedido pagado). */
  refundedAt?: string;
  delivery?: OrderDelivery;
  /** Detalle para la línea de tiempo (p. ej. «Cancelado por el cliente · pago devuelto»). */
  note?: string;
}

export interface InternalOrder extends Order {
  userId: string;
  deliveryQuoteId: string;
  /** Dueño del negocio: el gateway solo deja que él rechace o cancele el pedido. */
  businessOwnerId: string | null;
}
