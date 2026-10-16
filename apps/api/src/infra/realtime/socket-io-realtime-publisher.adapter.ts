import { Injectable } from '@nestjs/common';
import type { ServerToClientEvents } from '@parla/types';
import type { RealtimePublisher } from './realtime-publisher.port';
import { SocketServerHolder, userRoom } from './socket-server.holder';

@Injectable()
export class SocketIoRealtimePublisher implements RealtimePublisher {
  constructor(private readonly holder: SocketServerHolder) {}

  toUsers<E extends keyof ServerToClientEvents>(
    userIds: readonly string[],
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    const server = this.holder.server;
    if (!server || userIds.length === 0) return;
    const rooms = [...new Set(userIds)].map(userRoom);
    (server.to(rooms).emit as (ev: string, ...args: unknown[]) => boolean)(event, ...payload);
  }
}
