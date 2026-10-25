import type { CatalogSource, StoreConnector, StoreStatus } from './stores.types';
/**
 * Servicios dentro de Parla (estilo WeChat): el cliente compra en sistemas externos (tienda,
 * delivery, pagos) sin salir del chat. El gateway traduce cada API externa a estos contratos.
 * Montos siempre en céntimos (enteros) para no perder precisión.
 */

export type ServiceId = 'mercado' | 'tecnologia' | 'ferreteria' | 'salud';

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
  /** La ficha del producto: texto plano (hasta 600 letras) y hasta 4 fotos (la primera es imageUrl). Pueden faltar. */
  description?: string;
  images?: string[];
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
  /** Propina para el repartidor (0 a S/ 100); se cobra con el pedido y va completa al repartidor. */
  tipCents?: number;
  /** Cupón de descuento o envío gratis. */
  couponCode?: string;
}

export interface OrderLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  /** Miniatura de la primera foto del producto (pedidos nuevos). */
  imageUrl?: string | null;
}

export interface OrderQuote {
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  /** El delivery que se le paga al repartidor al llegar (no entra al total del QR). 0 si va dentro del total. */
  deliveryOnArrivalCents: number;
  /** Descuento del cupón (ya restado del total). */
  discountCents: number;
  coupon: AppliedCoupon | null;
  totalCents: number;
  currency: Currency;
  etaMinutes: number;
  /** Distancia de la tienda al punto de entrega (si se marcó en el mapa). */
  distanceKm?: number;
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

/** La tienda de una persona en Parla (la ve su dueño en «Mi negocio»). */
export interface BusinessInfo {
  id: string;
  name: string;
  /** Categoría: mercado, tecnologia, ferreteria o salud. */
  service: ServiceId;
  description: string;
  address: string;
  /** Teléfono de contacto de la tienda (E.164); vacío si todavía no lo puso. */
  phone: string;
  location: GeoPoint | null;
  /** Mientras está en revisión o suspendida no recibe pedidos. */
  status: StoreStatus;
  /** Motivo del rechazo o la suspensión (lo escribe soporte). */
  reviewNote: string;
  /** De dónde sale su catálogo: el de Parla (native) o su propia API (api). */
  source: CatalogSource;
  /** El dueño puede pausar los pedidos aunque esté en horario. */
  acceptingOrders: boolean;
  /** Horario de atención, hora de Lima («HH:MM»). */
  opensAt: string;
  closesAt: string;
  /** Sistema externo al que está conectada (null = ninguno). */
  connector: StoreConnector | null;
  /** FerroHub validó la ferretería: lleva la insignia «Ferretería verificada». */
  verified: boolean;
}

/** Si un negocio recibe pedidos ahora (lo ve el cliente antes de pagar). */
export interface BusinessStatus {
  name: string;
  open: boolean;
  /** Por qué no recibe pedidos (pausado o fuera de horario); null si está abierto. */
  closedMessage: string | null;
  opensAt: string;
  closesAt: string;
  rating: RatingSummary;
}

export interface UpdateBusinessRequest {
  acceptingOrders?: boolean;
  opensAt?: string;
  closesAt?: string;
  name?: string;
  description?: string;
  address?: string;
  phone?: string;
  location?: GeoPoint | null;
}

/** Cambio de un producto del catálogo de la tienda (lo hace el dueño). */
export interface UpdateCatalogProductRequest {
  priceCents?: number;
  /** Precio normal para mostrarlo en oferta; null quita la oferta. */
  listPriceCents?: number | null;
  stock?: number;
}

/** Cuándo un pedido es «grande» para una tienda (obra, mucha cantidad): lo confirma ella con el cliente antes de prepararlo. */
export interface BigOrderRules {
  /** Total del pedido desde el cual es grande (céntimos). */
  totalCents: number;
  /** Unidades desde las cuales es grande. */
  units: number;
  /** WhatsApp del administrador de la tienda (solo dígitos, con país); null si no lo tiene. */
  whatsapp: string | null;
}

export interface OrderBusiness {
  id: string;
  name: string;
  /** Cuenta del dueño en Parla, para escribirle por chat. */
  ownerId: string;
  /** Dónde recoge el repartidor. */
  address: string;
  location: GeoPoint | null;
  bigOrder: BigOrderRules;
}

export interface Order {
  id: string;
  /** Clave de la tienda que lo prepara (el id de la tienda). */
  service: string;
  /** Negocio que prepara el pedido; null en pedidos sin negocio asignado. */
  business: OrderBusiness | null;
  status: OrderStatus;
  /** Pedido grande (obra, mucha cantidad): la tienda lo confirma con el cliente antes de prepararlo. */
  big: boolean;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  /** Propina para el repartidor (incluida en el total). */
  tipCents: number;
  /**
   * Delivery que el cliente le paga al repartidor al llegar (efectivo, Yape o Plin). No entra al total del QR: por la
   * app se paga solo lo de los productos. 0 si el delivery se cobró dentro del total (pedidos anteriores).
   */
  deliveryOnArrivalCents: number;
  /** Descuento del cupón (ya restado del total) y su código. */
  discountCents: number;
  couponCode: string | null;
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
  /** Calificación que dejó el cliente al recibirlo; null si aún no califica. */
  rating?: OrderRating | null;
  /** Hay foto de la entrega (se ve en GET /orders/:id/delivery-photo). */
  hasDeliveryPhoto?: boolean;
  /** Se dejó sin código (p. ej. en portería), con foto como prueba. */
  deliveredWithoutCode?: boolean;
  /** Reclamos del pedido (el último primero). */
  claims?: OrderClaim[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderCustomer {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  /** Solo en un pedido grande: para que la tienda lo confirme con el cliente al instante. */
  phone?: string | null;
}

/** Pedido tal como lo ve el dueño del negocio: con quién lo pidió, para atenderlo y escribirle. */
export interface BusinessOrder extends Order {
  customer: OrderCustomer;
}

export type DriverVehicle = 'Moto' | 'Bicicleta' | 'Auto' | 'A pie';

/** Calificación de un pedido entregado (como en Rappi): al repartidor y a la tienda, de 1 a 5. */
export interface OrderRating {
  driverStars: number | null;
  storeStars: number | null;
  comment: string;
  at: string;
}

export interface RateOrderRequest {
  driverStars?: number | null;
  storeStars?: number | null;
  comment?: string;
}

/** Promedio de calificaciones (null si todavía no hay ninguna). */
export interface RatingSummary {
  average: number | null;
  count: number;
}

export type DriverStatus = 'pending' | 'approved' | 'rejected';

/** Repartidor de Rapidito (cuenta de Parla con su vehículo). */
export interface DriverInfo {
  vehicle: DriverVehicle;
  /** Vacío para bicicleta o a pie. */
  plate: string;
  /** Conectado: recibe ofertas y puede tomar pedidos. */
  online: boolean;
  /** Verificación: en revisión, aprobado o rechazado (solo los aprobados reparten). */
  status: DriverStatus;
  /** Motivo del rechazo o lo que pide soporte. */
  reviewNote: string | null;
  /** Ya subió la foto de su documento. */
  hasDocument: boolean;
}

/** Alta o cambio del perfil de repartidor. */
export interface DriverProfileRequest {
  vehicle: DriverVehicle;
  plate?: string;
  /** DNI (8 dígitos); se pide al registrarse. */
  dniNumber?: string;
  /** Licencia de conducir (moto o auto). */
  licenseNumber?: string;
}

/** Repartidor tal como lo ve soporte para aprobarlo. */
export interface AdminDriver {
  userId: string;
  displayName: string;
  phone: string | null;
  vehicle: DriverVehicle;
  plate: string;
  dniNumber: string | null;
  licenseNumber: string | null;
  hasDocument: boolean;
  status: DriverStatus;
  reviewNote: string | null;
  /** Lo que debe a Parla por la comisión de los deliveries que cobró en mano (0 si no debe). */
  debtCents: number;
  /** Cómo lo califican los clientes (estrellas de 1 a 5). */
  rating: RatingSummary;
  createdAt: string;
}

export type ClaimReason = 'missing_items' | 'damaged' | 'wrong_items' | 'not_delivered' | 'other';
export type ClaimStatus = 'open' | 'refunding' | 'refunded' | 'rejected';

export interface ClaimItem {
  productId: string;
  name: string;
  quantity: number;
  /** Lo que se pagó por esas unidades. */
  totalCents: number;
}

/** Reclamo de un pedido entregado. */
export interface OrderClaim {
  id: string;
  orderId: string;
  reason: ClaimReason;
  comment: string;
  items: ClaimItem[];
  hasPhoto: boolean;
  /** Devolución sugerida (lo que costaron los productos marcados). */
  suggestedCents: number;
  status: ClaimStatus;
  refundCents: number | null;
  resolutionNote: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreateClaimRequest {
  reason: ClaimReason;
  items?: { productId: string; quantity: number }[];
  comment?: string;
  /** Foto subida antes con POST /photos. */
  photoId?: string;
}

/** Reclamo para soporte: con el pedido, quién lo pidió y cuánto queda por devolver. */
export interface AdminClaim extends OrderClaim {
  customerName: string;
  businessName: string | null;
  driverName: string | null;
  orderTotalCents: number;
  /** Lo que todavía se puede devolver de ese pedido. */
  refundableCents: number;
  lines: OrderLine[];
  hasDeliveryPhoto: boolean;
  deliveredWithoutCode: boolean;
}

/** Lo que lleva ganado un repartidor (las tarifas de delivery de sus entregas). */
export interface DriverEarnings {
  todayCents: number;
  todayDeliveries: number;
  weekCents: number;
  weekDeliveries: number;
  totalCents: number;
  totalDeliveries: number;
  /** De lo ganado, cuánto fue propina. */
  tipsCents: number;
  /** Comisión de Rapidito descontada en total (5 % de las tarifas). */
  commissionCents: number;
  rating: RatingSummary;
}

/** cash_collected: lo cobrado en mano (descuenta lo que no pasó por la app); commission_payment: pago de comisión a Parla. */
export type LedgerEntryKind = 'delivery_fee' | 'commission' | 'tip' | 'payout' | 'cash_collected' | 'commission_payment';
export type PayoutStatus = 'pending' | 'paid' | 'failed';

/** Un movimiento del saldo del repartidor (positivo suma, negativo resta). */
export interface LedgerEntry {
  id: string;
  kind: LedgerEntryKind;
  amountCents: number;
  orderId: string | null;
  /** Solo en retiros: si ya se depositó, está en curso o falló (y el saldo volvió). */
  status: PayoutStatus | null;
  createdAt: string;
}

/** La billetera del repartidor: saldo, cuenta de depósito y movimientos. */
export interface DriverWallet {
  /** Lo que se le puede depositar ahora (negativo = lo que debe a Parla por comisiones). */
  balanceCents: number;
  /** Lo que debe a Parla por la comisión de los deliveries cobrados en mano (0 si no debe). */
  debtCents: number;
  /** Deuda máxima antes de no poder tomar más pedidos. */
  maxDebtCents: number;
  /** Reservado en un depósito en curso. */
  pendingPayoutCents: number;
  /** Número de PagaYa donde se le deposita (9 dígitos); null si no lo puso. */
  payoutPhone: string | null;
  /** Hora del depósito automático diario (hora de Lima). */
  autoPayoutAt: string;
  /** Mínimo para el depósito automático. */
  minAutoPayoutCents: number;
  /** Porcentaje de la tarifa de delivery que gana el repartidor. */
  driverSharePercent: number;
  entries: LedgerEntry[];
}

/** Resultado de un retiro (lo hace el gateway con PagaYa). */
export interface PayoutResult {
  payoutId: string;
  amountCents: number;
  status: PayoutStatus;
  transferId: string | null;
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
  /** Tarifa de delivery del pedido (lo que pagó el cliente por el envío). */
  deliveryFeeCents: number;
  tipCents: number;
  /**
   * Lo que el repartidor le cobra al cliente al entregar (delivery + propina, en efectivo, Yape o Plin). 0 si el
   * delivery se cobró dentro del pedido (pedidos anteriores).
   */
  collectOnArrivalCents: number;
  /** De lo que cobra en mano, lo que le debe a Parla por este pedido (la comisión del delivery). */
  commissionDueCents: number;
  /** Comisión de Rapidito sobre la tarifa (DRIVER_SHARE_PERCENT: por defecto el 5 %). */
  commissionCents: number;
  commissionPercent: number;
  /** Lo que gana el repartidor: su porcentaje de la tarifa (95 % por defecto) + la propina completa. */
  earningsCents: number;
  /** Distancia del repartidor a la tienda (km), si se conoce su ubicación. */
  distanceToStoreKm: number | null;
  /** Asignación óptima: oferta solo para este repartidor hasta esta hora (null = oferta abierta o ya es suyo). */
  exclusiveUntil: string | null;
  hasDeliveryPhoto: boolean;
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

/** Entregar: con el código del cliente, o (si no responde) dejarlo con una foto como prueba. */
export interface DeliverOrderRequest {
  code?: string;
  photoId?: string;
}

/** Con quién chatear sobre un pedido. */
export type OrderContactRole = 'business' | 'customer' | 'driver';

/** Respuesta al crear un pedido: el pedido y el QR para pagarlo. */
export type CreateOrderRequest = QuoteRequest;

// ── Contratos internos gateway ↔ core (no salen del backend) ──────────────────

export interface InternalCreateOrder {
  id: string;
  userId: string;
  /** Clave de la tienda (su id). */
  service: string;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  /** Descuento del cupón; el core vuelve a validar el cupón y registra su uso. */
  discountCents?: number;
  couponCode?: string | null;
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
  /** Id del pago en la pasarela al confirmarse (en Mercado Pago no es el del checkout). */
  chargeId?: string;
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

/** Dirección guardada (se recuerda sola al pedir; se le puede poner nombre). */
export interface SavedAddress {
  id: string;
  label: string;
  line: string;
  reference: string;
  location: GeoPoint | null;
  lastUsedAt: string;
}

export interface UpdateSavedAddressRequest {
  label: string;
}

/** percent: % de los productos (con tope opcional) · amount: monto fijo · free_delivery: envío gratis. */
export type CouponKind = 'percent' | 'amount' | 'free_delivery';

/** El cupón aplicado a una cotización. */
export interface AppliedCoupon {
  code: string;
  description: string;
  kind: CouponKind;
  discountCents: number;
}

/** Para el gateway: ¿vale este cupón para esta persona y este carrito? */
export interface InternalCouponQuote {
  code: string;
  userId: string;
  subtotalCents: number;
  deliveryFeeCents: number;
}

export interface CreateCouponRequest {
  code: string;
  description: string;
  kind: CouponKind;
  value?: number;
  maxDiscountCents?: number | null;
  minSubtotalCents?: number;
  firstOrderOnly?: boolean;
  perUserLimit?: number;
  maxUses?: number | null;
  endsAt?: string | null;
}

/** Cupón para soporte, con cuántas veces se usó. */
export interface AdminCoupon extends Required<Omit<CreateCouponRequest, 'endsAt'>> {
  endsAt: string | null;
  active: boolean;
  uses: number;
  createdAt: string;
}

/** Un pedido para soporte: con las personas y en qué quedó. */
export interface AdminOrder {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string | null;
  businessName: string | null;
  driverName: string | null;
  totalCents: number;
  discountCents: number;
  couponCode: string | null;
  address: DeliveryAddress;
  lines: OrderLine[];
  timeline: OrderTimelineEntry[];
  paidAt: string | null;
  refundedAt: string | null;
  openClaims: number;
  createdAt: string;
  updatedAt: string;
}

/** Un movimiento de la billetera de la tienda (positivo suma, negativo resta). */
export interface StoreWalletEntry {
  id: string;
  kind: 'sale' | 'commission' | 'payout';
  amountCents: number;
  orderId: string | null;
  /** Solo en depósitos: si ya se depositó, está en curso o falló (y el saldo volvió). */
  status: PayoutStatus | null;
  createdAt: string;
}

/** «Mis ventas y depósitos»: lo que la tienda lleva vendido, la comisión de Parla y lo que ya se le depositó. */
export interface StoreWallet {
  balanceCents: number;
  pendingPayoutCents: number;
  /** Número de PagaYa donde se le deposita; null si todavía no lo puso. */
  payoutPhone: string | null;
  /** Hora (de Lima) del depósito automático diario. */
  autoPayoutAt: string;
  minAutoPayoutCents: number;
  /** Porcentaje de los productos que se queda Parla. */
  commissionPercent: number;
  entries: StoreWalletEntry[];
}
