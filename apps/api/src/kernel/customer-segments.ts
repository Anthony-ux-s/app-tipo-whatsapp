import type { CustomerSegment, SegmentInfo } from '@parla/types';

/** Lo que se sabe de una persona para ubicarla en un grupo (pedidos que no se cancelaron ni vencieron). */
export interface CustomerStats {
  /** Pedidos entregados. */
  deliveredOrders: number;
  /** Pedidos que sí se pagaron (en curso o entregados). */
  paidOrders: number;
  spentCents: number;
  lastOrderAt: Date | null;
  registeredAt: Date;
}

const DAY_MS = 86_400_000;
/** Cuenta con menos días que esto y sin compras = «nuevo». */
export const NEW_DAYS = 14;
/** Sin comprar hace más de estos días = «inactivo». */
export const LAPSED_DAYS = 30;
export const LOYAL_ORDERS = 3;
export const VIP_SPENT_CENTS = 30_000;
export const VIP_ORDERS = 5;

/** Orden de prioridad: la persona cae en el primero que cumple, de lo más específico a lo más general. */
export const SEGMENT_ORDER: CustomerSegment[] = ['vip', 'loyal', 'lapsed', 'never_bought', 'new', 'all'];

export const SEGMENT_LABELS: Record<CustomerSegment, { label: string; rule: string }> = {
  vip: { label: 'Mejores clientes', rule: `${VIP_ORDERS} o más pedidos entregados, o S/ ${VIP_SPENT_CENTS / 100} o más gastados` },
  loyal: { label: 'Clientes frecuentes', rule: `${LOYAL_ORDERS} o más pedidos entregados y compró en los últimos ${LAPSED_DAYS} días` },
  lapsed: { label: 'Clientes que se enfriaron', rule: `Compró antes, pero hace más de ${LAPSED_DAYS} días que no pide` },
  never_bought: { label: 'Nunca han comprado', rule: `Cuenta de más de ${NEW_DAYS} días y ningún pedido` },
  new: { label: 'Recién llegados', rule: `Cuenta de hasta ${NEW_DAYS} días y ningún pedido` },
  all: { label: 'Todos', rule: 'Cualquier persona que no entre en un grupo con ruleta propia' },
};

/** El grupo más específico al que pertenece la persona. */
export function segmentOf(s: CustomerStats, now = new Date()): CustomerSegment {
  const sinceLast = s.lastOrderAt ? (now.getTime() - s.lastOrderAt.getTime()) / DAY_MS : Infinity;
  if (s.deliveredOrders >= VIP_ORDERS || s.spentCents >= VIP_SPENT_CENTS) return 'vip';
  if (s.paidOrders === 0) return (now.getTime() - s.registeredAt.getTime()) / DAY_MS <= NEW_DAYS ? 'new' : 'never_bought';
  if (sinceLast > LAPSED_DAYS) return 'lapsed';
  if (s.deliveredOrders >= LOYAL_ORDERS) return 'loyal';
  return 'all';
}

/** ¿Le toca una ruleta de este grupo a esta persona? `all` es la red de seguridad: cualquiera que no tenga una propia. */
export function belongsTo(campaignSegment: CustomerSegment, personSegment: CustomerSegment, hasOwnCampaign: (s: CustomerSegment) => boolean): boolean {
  if (campaignSegment === personSegment) return true;
  return campaignSegment === 'all' && !hasOwnCampaign(personSegment);
}

export function describeSegments(counts: Record<CustomerSegment, number>): SegmentInfo[] {
  return SEGMENT_ORDER.map((id) => ({ id, ...SEGMENT_LABELS[id], audience: counts[id] ?? 0 }));
}
