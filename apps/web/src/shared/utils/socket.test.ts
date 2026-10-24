import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUnauthorizedHandler } from './http';
import { connectSocket, disconnectSocket, getConnectionState, subscribeConnection } from './socket';

class FakeWebSocket {
  static OPEN = 1;
  static last: FakeWebSocket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  closedWith: number | null = null;
  close(code?: number) {
    this.closedWith = code ?? 1000;
  }
  send() {}
}

const storage = new Map<string, string>();

describe('estado de la conexión (aviso «Conectando…»)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3100' });
    storage.clear();
    vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
  });
  afterEach(() => {
    disconnectSocket();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('empieza en «conectando», pasa a «en línea» al abrir y avisa a quien escucha', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeConnection(() => seen.push(getConnectionState()));
    connectSocket('token');
    expect(getConnectionState()).toBe('connecting');
    FakeWebSocket.last.onopen?.();
    expect(getConnectionState()).toBe('online');
    unsubscribe();
    expect(seen).toContain('online');
  });

  it('si se cae pasa a «conectando» mientras reintenta y vuelve a «en línea» al reconectar', () => {
    connectSocket('token');
    FakeWebSocket.last.onopen?.();
    FakeWebSocket.last.onclose?.({ code: 1006 });
    expect(getConnectionState()).toBe('connecting');
    vi.advanceTimersByTime(6000);
    FakeWebSocket.last.onopen?.();
    expect(getConnectionState()).toBe('online');
  });

  it('un socket nuevo (otra sesión) no hereda «en línea» del anterior', () => {
    connectSocket('uno');
    FakeWebSocket.last.onopen?.();
    disconnectSocket();
    connectSocket('dos');
    expect(getConnectionState()).toBe('connecting');
  });

  it('si el servidor manda latidos y luego se calla, la conexión se reabre sola', () => {
    connectSocket('token');
    const ws = FakeWebSocket.last;
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.();
    ws.onmessage?.({ data: '{"t":"hb"}' });
    vi.advanceTimersByTime(30_000);
    expect(ws.closedWith).toBeNull();
    vi.advanceTimersByTime(40_000);
    expect(ws.closedWith).toBe(4000);
  });

  it('con un servidor sin latidos no se corta una conexión tranquila', () => {
    connectSocket('token');
    const ws = FakeWebSocket.last;
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.();
    vi.advanceTimersByTime(5 * 60_000);
    expect(ws.closedWith).toBeNull();
  });

  it('si el token con que se abrió vence pero la sesión ya se renovó, se reabre con el nuevo (no cierra sesión)', () => {
    let expired = 0;
    setUnauthorizedHandler(() => void expired++);
    storage.set('parla.token', 'viejo');
    connectSocket('viejo');
    FakeWebSocket.last.onopen?.();
    storage.set('parla.token', 'nuevo');
    FakeWebSocket.last.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(6000);
    expect(FakeWebSocket.last.url).toContain('token=nuevo');
    expect(expired).toBe(0);
  });

  it('si vence el token y no hay uno nuevo, se cierra la sesión', () => {
    let expired = 0;
    setUnauthorizedHandler(() => void expired++);
    storage.set('parla.token', 'viejo');
    connectSocket('viejo');
    FakeWebSocket.last.onopen?.();
    FakeWebSocket.last.onclose?.({ code: 4401 });
    expect(expired).toBe(1);
  });
});
