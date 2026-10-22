import type { ClaimReason, ClaimStatus, OrderStatus, ServiceId } from '@parla/types';

/** Cada categoría: su ícono 3D (en /public/services) y los textos de sus tiendas. */
export const SERVICE_VISUALS: Record<ServiceId, { art: string; title: string; placeholder: string; empty: string }> = {
  mercado: { art: 'mercado', title: 'Mercado', placeholder: '¿Qué necesitas? ej. un kilo de azúcar, arroz', empty: 'Busca lo que necesitas y agrégalo.' },
  tecnologia: { art: 'tecnologia', title: 'Tecnología', placeholder: '¿Qué buscas? ej. celular, audífonos', empty: 'Busca celulares, laptops o accesorios y agrégalos.' },
  ferreteria: { art: 'ferreteria', title: 'Ferretería', placeholder: '¿Qué buscas? ej. martillo, pintura', empty: 'Busca herramientas o materiales y agrégalos.' },
  salud: { art: 'salud', title: 'Salud', placeholder: '¿Qué buscas? ej. vitamina C', empty: 'Busca lo que necesitas en la farmacia y agrégalo.' },
};

export const SERVICE_IDS = Object.keys(SERVICE_VISUALS) as ServiceId[];

export function isServiceId(value: string | undefined): value is ServiceId {
  return !!value && value in SERVICE_VISUALS;
}

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
