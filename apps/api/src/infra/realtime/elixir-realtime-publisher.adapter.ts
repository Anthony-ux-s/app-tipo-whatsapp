import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerToClientEvents } from '@parla/types';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { RealtimePublisher } from './realtime-publisher.port';

/**
 * Publica en el servicio de tiempo real (Elixir) por su endpoint interno.
 * No bloquea el caso de uso: si el tiempo real no está, el evento se pierde pero el dato ya quedó
 * guardado, y los navegadores lo recuperan al reconectarse.
 */
@Injectable()
export class ElixirRealtimePublisher implements RealtimePublisher {
  private readonly logger = new Logger('RealtimePublisher');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  toUsers<E extends keyof ServerToClientEvents>(
    userIds: readonly string[],
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    if (userIds.length === 0) return;
    void fetch(`${this.env.realtimeUrl}/internal/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': this.env.internalToken },
      body: JSON.stringify({ users: [...new Set(userIds)], event, data: payload[0] }),
      signal: AbortSignal.timeout(5_000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn(`El tiempo real respondió ${res.status} a «${event}»`);
      })
      .catch((error: Error) => this.logger.warn(`Tiempo real no disponible («${event}»): ${error.message}`));
  }
}
