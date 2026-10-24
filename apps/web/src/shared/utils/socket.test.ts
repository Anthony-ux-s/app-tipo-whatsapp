import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  close() {}
  send() {}
}

describe('estado de la conexión (aviso «Conectando…»)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3100' });
    vi.stubGlobal('window', { setTimeout, clearTimeout });
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
});
