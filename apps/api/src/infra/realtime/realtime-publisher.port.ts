import type { ServerToClientEvents } from '@parla/types';

/** Envía eventos en tiempo real a usuarios concretos (todas sus pestañas y dispositivos). */
export interface RealtimePublisher {
  toUsers<E extends keyof ServerToClientEvents>(
    userIds: readonly string[],
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void;
}

export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');
