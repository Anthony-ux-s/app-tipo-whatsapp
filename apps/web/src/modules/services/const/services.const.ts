import type { ClaimReason, ClaimStatus, OrderStatus, ServiceId } from '@parla/types';
import type { ServiceIconName } from '../components/ServiceIcons';

/** Cada servicio: su ícono 3D (en /public/services) y su tienda (se abre si el servicio está disponible). */
export const SERVICE_VISUALS: Record<ServiceId, { art: string; to: string | null }> = {
  mercado: { art: 'mercado', to: '/app/servicios/mercado' },
  tecnologia: { art: 'tecnologia', to: '/app/servicios/tecnologia' },
  ferreteria: { art: 'ferreteria', to: '/app/servicios/ferreteria' },
  salud: { art: 'salud', to: '/app/servicios/salud' },
};

/** Textos de la tienda de cada servicio. */
export const STORE_TEXTS: Record<ServiceId, { title: string; subtitle: string; placeholder: string; empty: string }> = {
  mercado: { title: 'Mercado', subtitle: 'Tienda MercaYa · delivery Rapidito · pago con QR', placeholder: '¿Qué necesitas? ej. un kilo de azúcar, arroz', empty: 'Busca lo que necesitas en el Mercado y agrégalo.' },
  tecnologia: { title: 'Tecnología', subtitle: 'Tienda conectada · delivery Rapidito · pago con QR', placeholder: '¿Qué buscas? ej. celular, audífonos', empty: 'Busca celulares, laptops o accesorios y agrégalos.' },
  ferreteria: { title: 'Ferretería', subtitle: 'Ferretería conectada · delivery Rapidito · pago con QR', placeholder: '¿Qué buscas? ej. martillo, pintura', empty: 'Busca herramientas o materiales y agrégalos.' },
  salud: { title: 'Salud', subtitle: 'Farmacia conectada · delivery Rapidito · pago con QR', placeholder: '¿Qué buscas? ej. vitamina C', empty: 'Busca lo que necesitas en la farmacia y agrégalo.' },
};

export function isServiceId(value: string | undefined): value is ServiceId {
  return value === 'mercado' || value === 'tecnologia' || value === 'ferreteria' || value === 'salud';
}

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
  searching_driver: 'Buscando repartidor',
  driver_assigned: 'Repartidor asignado',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  payment_expired: 'Cobro vencido',
  cancelled: 'Cancelado',
};

/** Pasos que ve el cliente, en orden. */
export const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending_payment', label: 'Pago' },
  { status: 'preparing', label: 'Preparando' },
  { status: 'driver_assigned', label: 'Repartidor' },
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

/** Motivos de un reclamo («Tengo un problema con mi pedido»). */
export const CLAIM_REASONS: { id: ClaimReason; label: string; needsItems: boolean }[] = [
  { id: 'missing_items', label: 'Faltaron productos', needsItems: true },
  { id: 'damaged', label: 'Llegó dañado o en mal estado', needsItems: true },
  { id: 'wrong_items', label: 'Llegó otro producto', needsItems: true },
  { id: 'not_delivered', label: 'No me llegó el pedido', needsItems: false },
  { id: 'other', label: 'Otro problema', needsItems: false },
];

export const CLAIM_REASON_LABEL = Object.fromEntries(CLAIM_REASONS.map((r) => [r.id, r.label])) as Record<ClaimReason, string>;

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'En revisión',
  refunding: 'Devolviendo tu dinero',
  refunded: 'Devuelto',
  rejected: 'No procede',
};
