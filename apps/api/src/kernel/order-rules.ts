import type { OrderLine, OrderStatus, PushPayload } from '@parla/types';
import { ConflictError, ValidationError } from './domain-error';

/**
 * Estados de un pedido y transiciones válidas. Un pedido nunca retrocede: un aviso repetido o
 * desordenado de la pasarela o del delivery no puede «despagar» ni «desentregar» nada.
 * Pagado, el negocio lo acepta (preparing) o lo rechaza; al estar listo sale el motorizado de Rapidito.
 */
const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'payment_expired', 'cancelled'],
  paid: ['preparing', 'rejected', 'cancelled'],
  preparing: ['searching_driver', 'cancelled'],
  rejected: [],
  searching_driver: ['on_the_way', 'delivered', 'cancelled'],
  on_the_way: ['delivered'],
  delivered: [],
  payment_expired: [],
  cancelled: [],
};

export const ORDER_STATUSES = Object.keys(NEXT) as OrderStatus[];

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!NEXT[from].includes(to)) throw new ConflictError(`El pedido no puede pasar de ${from} a ${to}`);
}

/**
 * Los montos los calcula el gateway con los precios de la tienda; el core igual los verifica antes de
 * guardarlos (defensa en profundidad): cada línea cuadra, el subtotal es la suma y el total suma el envío.
 */
export function assertOrderTotals(lines: OrderLine[], subtotalCents: number, deliveryFeeCents: number, totalCents: number): void {
  if (lines.length === 0) throw new ValidationError('El pedido no tiene productos');
  for (const line of lines) {
    if (line.quantity < 1 || line.unitPriceCents < 0 || line.totalCents !== line.unitPriceCents * line.quantity) {
      throw new ValidationError(`La línea «${line.name}» no cuadra`);
    }
  }
  const sum = lines.reduce((acc, l) => acc + l.totalCents, 0);
  if (sum !== subtotalCents) throw new ValidationError('El subtotal no coincide con los productos');
  if (deliveryFeeCents < 0 || totalCents !== subtotalCents + deliveryFeeCents) {
    throw new ValidationError('El total no coincide con el subtotal más el delivery');
  }
}

export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

/** Aviso push para los cambios que le importan al cliente (sin datos sensibles). */
export function orderPush(orderId: string, status: OrderStatus, totalCents: number, driverName: string | null, businessName: string | null): PushPayload | null {
  const url = `/app/pedidos/${orderId}`;
  const tag = `order-${orderId}`;
  const business = businessName ?? 'El negocio';
  switch (status) {
    case 'paid':
      return { title: 'Pago recibido', body: `Pagaste ${formatSoles(totalCents)}. ${business} confirmará tu pedido en un momento.`, url, tag };
    case 'preparing':
      return { title: 'Están preparando tu pedido', body: `${business} aceptó tu pedido. Rapidito lo recogerá cuando esté listo.`, url, tag };
    case 'rejected':
      return { title: 'Tu pedido no fue aceptado', body: `${business} no puede atender tu pedido. Escríbele desde el pedido.`, url, tag };
    case 'searching_driver':
      return { title: 'Tu pedido está listo', body: 'Rapidito está asignando un motorizado.', url, tag };
    case 'on_the_way':
      return { title: 'Tu pedido va en camino', body: driverName ? `${driverName} lleva tu pedido.` : 'Un motorizado lleva tu pedido.', url, tag };
    case 'delivered':
      return { title: 'Pedido entregado', body: '¡Que lo disfrutes! Gracias por comprar con Parla.', url, tag };
    case 'payment_expired':
      return { title: 'El cobro venció', body: 'No recibimos el pago a tiempo. Puedes volver a hacer el pedido.', url, tag };
    default:
      return null;
  }
}

/** Aviso push para el dueño del negocio: llegó un pedido pagado que debe aceptar. */
export function businessOrderPush(orderId: string, status: OrderStatus, totalCents: number, customerName: string): PushPayload | null {
  if (status !== 'paid') return null;
  return {
    title: 'Nuevo pedido',
    body: `${customerName} pagó ${formatSoles(totalCents)}. Acéptalo para empezar a prepararlo.`,
    url: `/app/negocio/pedidos/${orderId}`,
    tag: `business-order-${orderId}`,
  };
}
