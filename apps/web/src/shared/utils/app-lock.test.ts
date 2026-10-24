import { describe, expect, it } from 'vitest';
import { checkCode, disableLock, enableLock, getLock, isValidCode, setAutoLock, waitRemainingMs, type KeyValueStore } from './app-lock';

const memory = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('bloqueo de la app', () => {
  it('valida el PIN y el patrón', () => {
    expect(isValidCode('pin', '1234', 4)).toBe(true);
    expect(isValidCode('pin', '123', 4)).toBe(false);
    expect(isValidCode('pin', '12a4', 4)).toBe(false);
    expect(isValidCode('pin', '123456', 6)).toBe(true);
    expect(isValidCode('pattern', '0148', 0)).toBe(true);
    expect(isValidCode('pattern', '014', 0)).toBe(false); // mínimo 4 puntos
    expect(isValidCode('pattern', '0140', 0)).toBe(false); // sin repetir puntos
    expect(isValidCode('pattern', '0149', 0)).toBe(false); // solo hay 9 puntos (0 al 8)
  });

  it('guarda solo un resumen, nunca el código, y lo reconoce', async () => {
    const store = memory();
    await enableLock('u1', 'pin', '4821', 4, 60_000, store);
    const raw = store.getItem('parla.lock.u1')!;
    expect(raw).not.toContain('4821');
    expect(getLock('u1', store)).toMatchObject({ kind: 'pin', length: 4, autoLockMs: 60_000 });
    expect(await checkCode('u1', '4821', 0, store)).toEqual({ ok: true });
    const bad = await checkCode('u1', '1111', 0, store);
    expect(bad).toMatchObject({ ok: false, attemptsLeft: 4 });
  });

  it('un PIN y un patrón con los mismos números no se confunden', async () => {
    const store = memory();
    await enableLock('u1', 'pattern', '0148', 0, 0, store);
    expect((await checkCode('u1', '0148', 0, store)).ok).toBe(true);
    const other = memory();
    await enableLock('u2', 'pin', '0148', 4, 0, other);
    expect((await checkCode('u2', '0148', 0, other)).ok).toBe(true);
  });

  it('tras 5 errores seguidos hay que esperar, y la espera crece', async () => {
    const store = memory();
    await enableLock('u1', 'pin', '4821', 4, 0, store);
    let last = await checkCode('u1', '0000', 1_000, store);
    for (let i = 0; i < 4; i++) last = await checkCode('u1', '0000', 1_000, store);
    expect(last).toMatchObject({ ok: false, waitMs: 30_000, attemptsLeft: 0 });
    // Aunque ahora acierte, mientras espera no se prueba.
    expect(await checkCode('u1', '4821', 2_000, store)).toMatchObject({ ok: false });
    expect(waitRemainingMs('u1', 2_000, store)).toBe(29_000);
    // Pasada la espera, acertar limpia los errores.
    expect(await checkCode('u1', '4821', 40_000, store)).toEqual({ ok: true });
    expect(waitRemainingMs('u1', 40_000, store)).toBe(0);
  });

  it('cambia el bloqueo automático y se puede desactivar', async () => {
    const store = memory();
    await enableLock('u1', 'pin', '4821', 4, 0, store);
    setAutoLock('u1', -1, store);
    expect(getLock('u1', store)!.autoLockMs).toBe(-1);
    disableLock('u1', store);
    expect(getLock('u1', store)).toBeNull();
    expect(await checkCode('u1', 'cualquiera', 0, store)).toEqual({ ok: true });
  });
});
