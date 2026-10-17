import type { OrderStatus, ServiceId } from '@parla/types';
import type { ServiceIconName } from '../components/ServiceIcons';

export const SERVICE_VISUALS: Record<ServiceId, { icon: ServiceIconName; to: string | null }> = {
  mercado: { icon: 'mercado', to: '/app/servicios/mercado' },
  salud: { icon: 'salud', to: null },
};

/** Sistemas externos que atienden el mercado (cada uno por su API, a través del gateway). */
export const MARKET_PARTNERS: { icon: ServiceIconName; name: string; role: string }[] = [
  { icon: 'mercaya', name: 'MercaYa', role: 'Tienda' },
  { icon: 'rapidito', name: 'Rapidito', role: 'Delivery' },
  { icon: 'pagaya', name: 'PagaYa', role: 'Pago con QR' },
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Esperando tu pago',
  paid: 'Esperando al negocio',
  preparing: 'Preparando',
  rejected: 'No aceptado',
  searching_driver: 'Buscando motorizado',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  payment_expired: 'Cobro vencido',
  cancelled: 'Cancelado',
};

/** Pasos que ve el cliente, en orden. */
export const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending_payment', label: 'Pago' },
  { status: 'preparing', label: 'Preparando' },
  { status: 'searching_driver', label: 'Motorizado' },
  { status: 'on_the_way', label: 'En camino' },
  { status: 'delivered', label: 'Entregado' },
];

/** Palabras que la gente escribe al pedir («un kilo de azúcar») y que no ayudan a buscar. */
export const FILLER_WORDS = new Set([
  'un', 'una', 'unos', 'unas', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'quiero', 'necesito', 'por', 'favor',
  'kilo', 'kilos', 'kg', 'gramos', 'gr', 'g', 'litro', 'litros', 'l', 'ml', 'paquete', 'paquetes', 'bolsa', 'bolsas', 'lata', 'latas',
  'medio', 'media', 'docena', 'docenas', 'botella', 'botellas', 'caja', 'cajas',
]);

export const MAX_SEARCH_TERMS = 6;
export const MAX_QUANTITY = 50;
