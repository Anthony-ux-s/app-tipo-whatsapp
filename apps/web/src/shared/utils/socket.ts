import type { ClientToServerEvents, ServerToClientEvents } from '@parla/types';
import { io, type Socket } from 'socket.io-client';

export type ParlaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ParlaSocket | null = null;

/** Un único socket por pestaña, autenticado con el token de la sesión. */
export function connectSocket(token: string): ParlaSocket {
  if (socket) return socket;
  socket = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
  return socket;
}

export function getSocket(): ParlaSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
