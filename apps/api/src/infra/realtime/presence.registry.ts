import { Injectable } from '@nestjs/common';
import type { PresenceStatus } from '@parla/types';

/** Cuántas conexiones abiertas tiene cada usuario (en memoria; en producción iría a Redis). */
@Injectable()
export class PresenceRegistry {
  private readonly connections = new Map<string, number>();

  /** Devuelve true si es la primera conexión del usuario (pasa a "en línea"). */
  connect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, count);
    return count === 1;
  }

  /** Devuelve true si era la última conexión (pasa a "desconectado"). */
  disconnect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 1) - 1;
    if (count <= 0) {
      this.connections.delete(userId);
      return true;
    }
    this.connections.set(userId, count);
    return false;
  }

  statusOf(userId: string): PresenceStatus {
    return this.connections.has(userId) ? 'online' : 'offline';
  }
}
