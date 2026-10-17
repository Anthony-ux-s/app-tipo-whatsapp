import type { OrderLine, OrderStatus, PushPayload } from '@parla/types';
import { randomInt } from 'node:crypto';
import { ConflictError, ValidationError } from './domain-error';

/**
 * Estados de un pedido y transiciones válidas. Un pedido nunca retrocede: un aviso repetido o
 * desordenado no puede «despagar» ni «desentregar» nada. Pagado, el negocio lo acepta (preparing) o
 * lo rechaza; listo, se ofrece a los repartidores; uno lo toma (driver_assigned), la tienda se lo
 * entrega (on_the_way) y el repartidor lo entrega con el código del cliente (delivered).
 */
const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'payment_expired', 'cancelled'],
  paid: ['preparing', 'rejected', 'cancelled'],
  preparing: ['searching_driver', 'cancelled'],
  rejected: [],
  searching_driver: ['driver_assigned', 'cancelled'],
  // El repartidor puede soltarlo (o la tienda pedir otro): vuelve a ofrecerse.
  driver_assigned: ['on_the_way', 'searching_driver', 'cancelled'],
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

/** Propina máxima para el repartidor (S/ 100). */
export const MAX_TIP_CENTS = 10_000;

/**
 * Los montos los calcula el gateway con los precios de la tienda; el core igual los verifica antes de
 * guardarlos (defensa en profundidad): cada línea cuadra, el subtotal es la suma y el total suma el
 * envío y la propina.
 */
export function assertOrderTotals(lines: OrderLine[], subtotalCents: number, deliveryFeeCents: number, totalCents: number, tipCents = 0): void {
  if (lines.length === 0) throw new ValidationError('El pedido no tiene productos');
  for (const line of lines) {
    if (line.quantity < 1 || line.unitPriceCents < 0 || line.totalCents !== line.unitPriceCents * line.quantity) {
      throw new ValidationError(`La línea «${line.name}» no cuadra`);
    }
  }
  const sum = lines.reduce((acc, l) => acc + l.totalCents, 0);
  if (sum !== subtotalCents) throw new ValidationError('El subtotal no coincide con los productos');
  if (tipCents < 0 || tipCents > MAX_TIP_CENTS) throw new ValidationError('La propina debe estar entre S/ 0 y S/ 100');
  if (deliveryFeeCents < 0 || totalCents !== subtotalCents + deliveryFeeCents + tipCents) {
    throw new ValidationError('El total no coincide con el subtotal más el delivery y la propina');
  }
}

export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

/** Aviso push para los cambios que le importan al cliente (sin datos sensibles). */
export function orderPush(
  orderId: string,
  status: OrderStatus,
  totalCents: number,
  driverName: string | null,
  businessName: string | null,
  refunded = false,
): PushPayload | null {
  const url = `/app/pedidos/${orderId}`;
  const tag = `order-${orderId}`;
  const business = businessName ?? 'El negocio';
  switch (status) {
    case 'paid':
      return { title: 'Pago recibido', body: `Pagaste ${formatSoles(totalCents)}. ${business} confirmará tu pedido en un momento.`, url, tag };
    case 'preparing':
      return { title: 'Están preparando tu pedido', body: `${business} aceptó tu pedido. Rapidito lo recogerá cuando esté listo.`, url, tag };
    case 'rejected':
      return { title: 'Tu pedido no fue aceptado', body: `${business} no puede atender tu pedido.${refunded ? ` Te devolvimos ${formatSoles(totalCents)}.` : ''}`, url, tag };
    case 'searching_driver':
      return { title: 'Tu pedido está listo', body: 'Buscando un repartidor de Rapidito.', url, tag };
    case 'driver_assigned':
      return { title: 'Ya tienes repartidor', body: `${driverName ?? 'Un repartidor'} va a recoger tu pedido. Ten a mano tu código de entrega.`, url, tag };
    case 'on_the_way':
      return { title: 'Tu pedido va en camino', body: driverName ? `${driverName} lleva tu pedido.` : 'Un repartidor lleva tu pedido.', url, tag };
    case 'delivered':
      return { title: 'Pedido entregado', body: '¡Que lo disfrutes! Gracias por comprar con Parla.', url, tag };
    case 'payment_expired':
      return { title: 'El cobro venció', body: 'No recibimos el pago a tiempo. Puedes volver a hacer el pedido.', url, tag };
    case 'cancelled':
      return { title: 'Pedido cancelado', body: refunded ? `Te devolvimos ${formatSoles(totalCents)} a tu billetera.` : 'Tu pedido se canceló.', url, tag };
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

/** Aviso push al dueño cuando el repartidor llega por el pedido y cuando se entregó al cliente. */
export function businessDeliveryPush(orderId: string, status: OrderStatus, driverName: string | null, customerName: string): PushPayload | null {
  const url = `/app/negocio/pedidos/${orderId}`;
  const tag = `business-order-${orderId}`;
  if (status === 'driver_assigned') {
    return { title: 'Repartidor en camino', body: `${driverName ?? 'Un repartidor'} va a tu tienda a recoger el pedido de ${customerName}.`, url, tag };
  }
  if (status === 'delivered') {
    return { title: 'Pedido entregado', body: `${customerName} recibió su pedido (confirmado con su código).`, url, tag };
  }
  return null;
}

/** Aviso push al repartidor que tenía el pedido: lo cancelaron o la tienda pidió otro repartidor. */
export function driverLostPush(orderId: string, status: OrderStatus, businessName: string): PushPayload | null {
  const url = `/app/rapidito/pedidos/${orderId}`;
  const tag = `driver-offer-${orderId}`;
  if (status === 'cancelled') return { title: 'Pedido cancelado', body: `${businessName} canceló el pedido. No tienes que recogerlo.`, url, tag };
  if (status === 'searching_driver') return { title: 'Ya no tienes este pedido', body: `${businessName} lo ofreció a otro repartidor.`, url, tag };
  return null;
}

/** Aviso push a los repartidores: hay un pedido listo para recoger. */
export function driverOfferPush(orderId: string, businessName: string, feeCents: number): PushPayload {
  return {
    title: 'Pedido para recoger',
    body: `${businessName} tiene un pedido listo. Ganas ${formatSoles(feeCents)}.`,
    url: `/app/rapidito/pedidos/${orderId}`,
    tag: `driver-offer-${orderId}`,
  };
}

/** Código de entrega de 4 dígitos (como el PIN de Rappi o el código de PedidosYa). */
export function newDeliveryCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/** Intentos con un código equivocado antes de bloquear la entrega (para que no se adivine). */
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;
