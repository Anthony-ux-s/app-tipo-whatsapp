import type { OrderStatus } from '@parla/types';

export type BusinessTab = 'nuevos' | 'preparando' | 'rapidito' | 'terminados';

/** Pestañas del panel del negocio y qué estados cae en cada una. */
export const BUSINESS_TABS: { id: BusinessTab; label: string; statuses: OrderStatus[] }[] = [
  { id: 'nuevos', label: 'Nuevos', statuses: ['paid'] },
  { id: 'preparando', label: 'Preparando', statuses: ['preparing'] },
  { id: 'rapidito', label: 'Con Rapidito', statuses: ['searching_driver', 'driver_assigned', 'on_the_way'] },
  { id: 'terminados', label: 'Terminados', statuses: ['delivered', 'rejected', 'cancelled'] },
];

/** Qué le toca al dueño en cada estado (el cliente ve otros textos). */
export const BUSINESS_STATUS_HINTS: Partial<Record<OrderStatus, string>> = {
  paid: 'Pagado. Acéptalo para empezar a prepararlo.',
  preparing: 'Cuando esté empacado, avisa a Rapidito para que un repartidor lo recoja.',
  searching_driver: 'Esperando que un repartidor de Rapidito lo tome.',
  driver_assigned: 'El repartidor va a tu tienda. Cuando le entregues el pedido, confírmalo aquí.',
  on_the_way: 'El repartidor lo lleva al cliente. Se entrega con el código del cliente.',
  delivered: 'Entregado al cliente.',
  rejected: 'No aceptaste este pedido.',
  cancelled: 'Pedido cancelado.',
};
