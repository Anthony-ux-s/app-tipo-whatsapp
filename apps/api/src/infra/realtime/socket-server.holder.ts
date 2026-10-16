import { Injectable } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents } from '@parla/types';
import type { Server } from 'socket.io';

export type ParlaServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** El gateway registra aquí el servidor de sockets al iniciar; el adaptador lo usa para emitir. */
@Injectable()
export class SocketServerHolder {
  server: ParlaServer | null = null;
}

export const userRoom = (userId: string) => `user:${userId}`;
