import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrderStatus } from '@parla/types';
import { BUSINESSES_REPOSITORY, type BusinessesRepository } from '../businesses.repository';
import type { OrderRecord } from '../orders.repository';

/** Cómo llama la ferretería a cada paso del pedido (RED WIIIL / FerroHub). */
const ESTADO: Partial<Record<OrderStatus, string>> = {
  paid: 'nuevo',
  preparing: 'preparando',
  searching_driver: 'listo',
  driver_assigned: 'listo',
  on_the_way: 'en_camino',
  delivered: 'entregado',
  rejected: 'cancelado',
  cancelled: 'cancelado',
  payment_expired: 'cancelado',
};

const TIMEOUT_MS = 6_000;

/**
 * Cada cambio de estado de un pedido se informa a la ferretería: `PATCH {api}/api/v1/orders/{pedido}` `{ estado }`.
 * Es un aviso: si la ferretería todavía no tiene esa ruta (404) o no responde, el pedido sigue como siempre.
 */
@Injectable()
export class StoreStatusSync {
  private readonly logger = new Logger('StoreStatusSync');

  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async statusChanged(order: OrderRecord): Promise<void> {
    const estado = ESTADO[order.status];
    if (!estado || !order.business) return;
    try {
      const business = await this.businesses.findById(order.business.id);
      const api = business?.api;
      if (!api || api.format !== 'redwiiil' || !api.baseUrl || !api.apiKey) return;
      const res = await fetch(`${api.baseUrl}/api/v1/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({ estado }),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 404: la API aún no soporta estados de vuelta. Se ignora sin ruido.
      if (res.status >= 500) this.logger.warn(`La ferretería respondió ${res.status} al estado «${estado}» del pedido ${order.id}`);
    } catch (error) {
      this.logger.warn(`No se pudo avisar el estado «${estado}» del pedido ${order.id}: ${(error as Error).message}`);
    }
  }
}
