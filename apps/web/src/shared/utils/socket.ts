import type { ClientToServerEvents, ServerToClientEvents } from '@parla/types';
import type { ConnectionState } from '../types/chat.types';
import { notifySessionExpired, tokenStorage } from './http';

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

/**
 * Estado de la conexión, guardado junto al propio socket (única fuente de verdad): el aviso «Conectando…» lo lee
 * de aquí, así nunca se queda desfasado si otra parte de la app se reinicia.
 */
let connectionState: ConnectionState = 'connecting';
const connectionListeners = new Set<() => void>();
function setConnectionState(next: ConnectionState): void {
  if (connectionState === next) return;
  connectionState = next;
  for (const listener of connectionListeners) listener();
}
export const getConnectionState = (): ConnectionState => connectionState;
export const subscribeConnection = (listener: () => void): (() => void) => {
  connectionListeners.add(listener);
  return () => void connectionListeners.delete(listener);
};

/** Cierre del gateway cuando el token vence. */
const SESSION_EXPIRED = 4401;
const MAX_BACKOFF_MS = 5000;
/** El gateway manda un latido («hb») cada 20 s. Si pasa más del doble sin recibir nada, la conexión murió en silencio. */
const SILENCE_LIMIT_MS = 50_000;
const WATCHDOG_EVERY_MS = 10_000;

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
  private lastReceivedAt = Date.now();
  /** Solo se vigila el silencio si este servidor ya mandó algún latido (con un gateway anterior no habría). */
  private sawHeartbeat = false;
  private watchdog: number | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<(data: never) => void>>();

  constructor(private token: string) {
    setConnectionState('connecting');
    this.open();
    this.watchdog = window.setInterval(() => this.checkAlive(), WATCHDOG_EVERY_MS);
    document.addEventListener('visibilitychange', this.onWake);
    window.addEventListener('online', this.onWake);
  }

  /** Al volver a la pestaña o recuperar internet: si la conexión no da señales, se reabre ya (sin esperar al reintento). */
  private readonly onWake = (): void => {
    if (document.visibilityState === 'visible') this.checkAlive(25_000);
  };

  private checkAlive(limit = SILENCE_LIMIT_MS): void {
    if (this.closed || !this.sawHeartbeat || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastReceivedAt > limit) this.ws.close(4000, 'sin señales');
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
    if (this.watchdog) window.clearInterval(this.watchdog);
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('online', this.onWake);
    this.ws?.close(1000);
    this.ws = null;
    this.setDisconnected();
  }

  private open(): void {
    // Con la web en Vercel (que no reenvía WebSockets) el tiempo real va directo al backend: VITE_WS_URL=wss://api.tudominio.com
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const base = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, '') || `${scheme}://${location.host}`;
    // Siempre con el token más reciente: la sesión se renueva sola y el anterior puede estar por vencer.
    this.token = tokenStorage.get() ?? this.token;
    const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.lastReceivedAt = Date.now();
      this.sawHeartbeat = false;
      this.connected = true;
      setConnectionState('online');
      this.dispatch('connect', undefined);
    };
    ws.onmessage = (message) => this.receive(message.data);
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setDisconnected();
      if (this.closed) return;
      // El gateway cierra con 4401 cuando vence el token con que se abrió. Si la sesión ya se renovó, se vuelve a abrir con el nuevo.
      if (event.code === SESSION_EXPIRED && tokenStorage.get() && tokenStorage.get() !== this.token) {
        this.scheduleReconnect();
        return;
      }
      if (event.code === SESSION_EXPIRED) {
        this.closed = true;
        if (this.watchdog) window.clearInterval(this.watchdog);
        notifySessionExpired();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    setConnectionState('connecting');
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
    setConnectionState('offline');
    this.dispatch('disconnect', undefined);
  }

  private send(frame: { t: string; d: unknown; ref?: string }): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    this.lastReceivedAt = Date.now();
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
    if (frame.t === 'hb') {
      this.sawHeartbeat = true;
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
