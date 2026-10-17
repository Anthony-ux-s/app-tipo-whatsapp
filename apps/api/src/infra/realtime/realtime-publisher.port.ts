import type { ServerToClientEvents } from '@parla/types';

/**
 * Envía eventos en tiempo real a personas concretas (todas sus pestañas y dispositivos).
 * El core no mantiene conexiones: el tiempo real vive en el servicio de Elixir.
 */
export interface RealtimePublisher {
  toUsers<E extends keyof ServerToClientEvents>(
    userIds: readonly string[],
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void;
}

export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');
