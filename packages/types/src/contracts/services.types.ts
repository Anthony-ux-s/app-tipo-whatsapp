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

export interface DeliveryAddress {
  line: string;
  reference: string;
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
 * Pagado → el negocio lo acepta (preparing) o lo rechaza (rejected) → listo: Rapidito busca motorizado
 * (searching_driver) → en camino → entregado.
 */
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'preparing'
  | 'rejected'
  | 'searching_driver'
  | 'on_the_way'
  | 'delivered'
  | 'payment_expired'
  | 'cancelled';

export interface OrderPayment {
  provider: string;
  /** Texto que va dentro del QR (en el simulador es la URL de pago). */
  qrText: string;
  payUrl: string;
  expiresAt: string;
  paidAt: string | null;
}

export interface OrderDelivery {
  provider: string;
  driverName: string | null;
  vehicle: string | null;
  etaMinutes: number | null;
  updatedAt: string;
}

/** Negocio que atiende un servicio (p. ej. la tienda del Mercado) y su dueño en Parla. */
export interface BusinessInfo {
  id: string;
  name: string;
  service: ServiceId;
}

export interface OrderBusiness {
  id: string;
  name: string;
  /** Cuenta del dueño en Parla, para escribirle por chat. */
  ownerId: string;
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
  /** Cotización del delivery, para despacharlo al confirmarse el pago. */
  deliveryQuoteId: string;
}

export interface InternalUpdateOrder {
  /** Solo se aplica si el pedido está en este estado (transiciones idempotentes). */
  expectStatus?: OrderStatus;
  status: OrderStatus;
  paidAt?: string;
  delivery?: OrderDelivery;
}

export interface InternalOrder extends Order {
  userId: string;
  deliveryQuoteId: string;
  /** Dueño del negocio: el gateway solo deja que él marque el pedido como listo. */
  businessOwnerId: string | null;
}
