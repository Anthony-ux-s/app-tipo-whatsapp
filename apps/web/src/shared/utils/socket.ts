import type { ClientToServerEvents, ServerToClientEvents } from '@parla/types';
import { notifySessionExpired } from './http';

/**
 * Cliente del tiempo real. Habla con el gateway (Go) por WebSocket en `/ws` con tramas
 * `{t, d, ref}` (docs/architecture/realtime-protocol.md); el gateway traduce y reenvía al
 * servicio de tiempo real (Elixir).
 */

type ServerEvent = keyof ServerToClientEvents;
type ClientEvent = keyof ClientToServerEvents;
type Payload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];
type Request<E extends ClientEvent> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends ClientEvent> = Parameters<ClientToServerEvents[E]> extends [unknown, (result: infer R) => void] ? R : never;
type RequestEvent = { [E in ClientEvent]: AckOf<E> extends never ? never : E }[ClientEvent];

export type SocketStatus = 'connect' | 'disconnect' | 'reconnecting';

/** Cierre del gateway cuando el token vence. */
const SESSION_EXPIRED = 4401;
const MAX_BACKOFF_MS = 5000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class ParlaSocket {
  connected = false;
  private ws: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private retryTimer: number | null = null;
  private nextRef = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<(data: never) => void>>();

  constructor(private readonly token: string) {
    this.open();
  }

  on<E extends ServerEvent>(event: E, fn: (data: Payload<E>) => void): void;
  on(event: SocketStatus, fn: () => void): void;
  on(event: string, fn: (data: never) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Evento sin respuesta. Si no hay conexión se descarta (como "escribiendo…" o la señalización). */
  emit<E extends ClientEvent>(event: E, data: Request<E>): void {
    this.send({ t: event, d: data });
  }

  /** Evento con respuesta (ack) del servidor. */
  request<E extends RequestEvent>(event: E, data: Request<E>, timeoutMs = 10_000): Promise<AckOf<E>> {
    if (!this.connected) return Promise.reject(new Error('Sin conexión. Inténtalo de nuevo en un momento.'));
    const ref = `r${++this.nextRef}`;
    return new Promise<AckOf<E>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(ref);
        reject(new Error('El servidor no respondió a tiempo'));
      }, timeoutMs);
      this.pending.set(ref, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.send({ t: event, d: data, ref });
    });
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.ws?.close(1000);
    this.ws = null;
    this.setDisconnected();
  }

  private open(): void {
    // Con la web en Vercel (que no reenvía WebSockets) el tiempo real va directo al backend: VITE_WS_URL=wss://api.tudominio.com
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const base = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, '') || `${scheme}://${location.host}`;
    const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.connected = true;
      this.dispatch('connect', undefined);
    };
    ws.onmessage = (message) => this.receive(message.data);
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setDisconnected();
      if (this.closed) return;
      if (event.code === SESSION_EXPIRED) {
        this.closed = true;
        notifySessionExpired();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.dispatch('reconnecting', undefined);
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
    this.attempts += 1;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed) this.open();
    }, delay);
  }

  private setDisconnected(): void {
    for (const [ref, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('Se perdió la conexión'));
      this.pending.delete(ref);
    }
    if (!this.connected) return;
    this.connected = false;
    this.dispatch('disconnect', undefined);
  }

  private send(frame: { t: string; d: unknown; ref?: string }): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let frame: { t?: string; d?: unknown; ref?: string };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.t === 'ack' && frame.ref) {
      const pending = this.pending.get(frame.ref);
      if (!pending) return;
      this.pending.delete(frame.ref);
      window.clearTimeout(pending.timer);
      pending.resolve(frame.d);
      return;
    }
    if (frame.t) this.dispatch(frame.t, frame.d);
  }

  private dispatch(event: string, data: unknown): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        (fn as (data: unknown) => void)(data);
      } catch (error) {
        console.error(`Error al procesar "${event}"`, error);
      }
    }
  }
}

let socket: ParlaSocket | null = null;

/** Un único socket por pestaña, autenticado con el token de la sesión. */
export function connectSocket(token: string): ParlaSocket {
  if (socket) return socket;
  socket = new ParlaSocket(token);
  return socket;
}

export function getSocket(): ParlaSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.close();
  socket = null;
}
