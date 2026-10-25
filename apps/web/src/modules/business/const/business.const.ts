import type { OrderStatus } from '@parla/types';

export type BusinessTab = 'nuevos' | 'preparando' | 'rapidito' | 'terminados';

/** Pestañas del panel del negocio y qué estados cae en cada una. */
export const BUSINESS_TABS: { id: BusinessTab; label: string; statuses: OrderStatus[] }[] = [
  { id: 'nuevos', label: 'Nuevos', statuses: ['paid'] },
  { id: 'preparando', label: 'Preparando', statuses: ['preparing'] },
  { id: 'rapidito', label: 'Con Rapidito', statuses: ['searching_driver', 'driver_assigned', 'on_the_way'] },
  { id: 'terminados', label: 'Terminados', statuses: ['delivered', 'rejected', 'cancelled'] },
];

/** Los pasos de un pedido para la tienda. */
export const BUSINESS_STEPS = ['Nuevo', 'Arreglar', 'Repartidor', 'En camino', 'Entregado'] as const;

/** En qué paso va el pedido (0 = nuevo). */
export function businessStep(status: OrderStatus): number {
  switch (status) {
    case 'paid':
      return 0;
    case 'preparing':
      return 1;
    case 'searching_driver':
    case 'driver_assigned':
      return 2;
    case 'on_the_way':
      return 3;
    default:
      return 4;
  }
}

/** Qué está pasando y qué toca hacer, dicho en una frase y una explicación corta. */
export function businessNow(status: OrderStatus, driverName: string): { title: string; description: string } {
  switch (status) {
    case 'paid':
      return { title: 'Llegó un pedido nuevo', description: 'El cliente ya pagó. Acéptalo para empezar a arreglarlo. Si no puedes atenderlo, recházalo y le devolvemos su dinero.' };
    case 'preparing':
      return { title: 'Arregla el pedido', description: 'Junta y empaca los productos. Cuando esté todo listo, toca el botón: recién ahí avisamos a los repartidores cercanos.' };
    case 'searching_driver':
      return { title: 'Buscando repartidor', description: 'Avisamos a los repartidores de Rapidito. El primero que lo tome irá a tu tienda a recogerlo.' };
    case 'driver_assigned':
      return { title: `${driverName} va a tu tienda`, description: 'Cuando llegue, entrégale el pedido y confírmalo aquí.' };
    case 'on_the_way':
      return { title: 'El pedido va en camino', description: 'El repartidor lo lleva al cliente. Se entrega con el código del cliente.' };
    default:
      return { title: 'Pedido entregado', description: 'El cliente lo recibió. ¡Buen trabajo!' };
  }
}

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
