import { Injectable } from '@nestjs/common';
import type { PresenceStatus } from '@parla/types';

/**
 * Quién está en línea. La fuente es el servicio de tiempo real (Elixir), que avisa al core cada vez
 * que alguien abre su primera conexión o cierra la última. En memoria; con varias instancias del
 * core iría a Redis.
 */
@Injectable()
export class PresenceRegistry {
  private readonly online = new Set<string>();

  set(userId: string, status: PresenceStatus): void {
    if (status === 'online') this.online.add(userId);
    else this.online.delete(userId);
  }

  statusOf(userId: string): PresenceStatus {
    return this.online.has(userId) ? 'online' : 'offline';
  }
}
