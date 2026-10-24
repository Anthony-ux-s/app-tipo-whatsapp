/**
 * Bloqueo de la app con PIN o patrón. Es un candado de ESTE dispositivo: protege que alguien que tome tu
 * teléfono o computador abierto pueda leer tus chats. El código nunca se guarda: solo un resumen (PBKDF2) con
 * sal propia, en este navegador. No va al servidor ni cifra los datos del navegador; no reemplaza la contraseña.
 */
export type LockKind = 'pin' | 'pattern';

/** Cuánto tiempo fuera de la app antes de pedir el código (ms). -1 = solo al abrir la app de nuevo. */
export type AutoLockMs = 0 | 60_000 | 300_000 | 900_000 | -1;

export const AUTO_LOCK_OPTIONS: { value: AutoLockMs; label: string }[] = [
  { value: 0, label: 'Al salir de la app' },
  { value: 60_000, label: 'Después de 1 minuto' },
  { value: 300_000, label: 'Después de 5 minutos' },
  { value: 900_000, label: 'Después de 15 minutos' },
  { value: -1, label: 'Solo al abrir la app' },
];

export interface LockConfig {
  kind: LockKind;
  /** Largo del PIN (4 o 6); en el patrón, 0. */
  length: number;
  salt: string;
  hash: string;
  iterations: number;
  autoLockMs: AutoLockMs;
}

export const PATTERN_MIN_DOTS = 4;
export const PIN_LENGTHS = [4, 6] as const;

const ITERATIONS = 150_000;
const FREE_ATTEMPTS = 5;
const MAX_WAIT_MS = 15 * 60_000;

/** Lo mínimo que se pide a un almacenamiento (localStorage en la app; un Map en las pruebas). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const configKey = (userId: string) => `parla.lock.${userId}`;
const failsKey = (userId: string) => `parla.lock.fails.${userId}`;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function digest(code: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256);
  return toBase64(new Uint8Array(bits));
}

/** Compara sin cortar en el primer carácter distinto. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** El código con su tipo, para que un PIN «1234» y un patrón «1234» no se confundan. */
const tagged = (kind: LockKind, code: string) => `${kind}:${code}`;

export function isValidCode(kind: LockKind, code: string, length: number): boolean {
  if (kind === 'pin') return new RegExp(`^\\d{${length}}$`).test(code);
  return /^[0-8]{4,9}$/.test(code) && new Set(code).size === code.length;
}

export function getLock(userId: string, store: KeyValueStore = localStorage): LockConfig | null {
  try {
    const raw = store.getItem(configKey(userId));
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

export async function enableLock(userId: string, kind: LockKind, code: string, length: number, autoLockMs: AutoLockMs, store: KeyValueStore = localStorage): Promise<void> {
  if (!isValidCode(kind, code, length)) throw new Error('El código no es válido');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const config: LockConfig = { kind, length: kind === 'pin' ? length : 0, salt: toBase64(salt), hash: await digest(tagged(kind, code), salt, ITERATIONS), iterations: ITERATIONS, autoLockMs };
  store.setItem(configKey(userId), JSON.stringify(config));
  store.removeItem(failsKey(userId));
}

export function setAutoLock(userId: string, autoLockMs: AutoLockMs, store: KeyValueStore = localStorage): void {
  const config = getLock(userId, store);
  if (config) store.setItem(configKey(userId), JSON.stringify({ ...config, autoLockMs }));
}

export function disableLock(userId: string, store: KeyValueStore = localStorage): void {
  store.removeItem(configKey(userId));
  store.removeItem(failsKey(userId));
}

interface Fails {
  count: number;
  until: number;
}

const readFails = (userId: string, store: KeyValueStore): Fails => {
  try {
    return JSON.parse(store.getItem(failsKey(userId)) ?? '') as Fails;
  } catch {
    return { count: 0, until: 0 };
  }
};

/** Cuánto falta (ms) para poder volver a intentar, tras demasiados errores seguidos. 0 = ya se puede. */
export function waitRemainingMs(userId: string, now = Date.now(), store: KeyValueStore = localStorage): number {
  return Math.max(0, readFails(userId, store).until - now);
}

/** Cuenta un error: desde el quinto seguido hay que esperar (30 s, luego el doble cada vez, hasta 15 min). */
function registerFailure(userId: string, now: number, store: KeyValueStore): void {
  const { count } = readFails(userId, store);
  const next = count + 1;
  const wait = next >= FREE_ATTEMPTS ? Math.min(MAX_WAIT_MS, 30_000 * 2 ** (next - FREE_ATTEMPTS)) : 0;
  store.setItem(failsKey(userId), JSON.stringify({ count: next, until: now + wait }));
}

export type CheckResult = { ok: true } | { ok: false; waitMs: number; attemptsLeft: number };

/** Comprueba el código. Si falla, anota el error (y desde el quinto seguido, exige esperar). */
export async function checkCode(userId: string, code: string, now = Date.now(), store: KeyValueStore = localStorage): Promise<CheckResult> {
  const config = getLock(userId, store);
  if (!config) return { ok: true };
  const waiting = waitRemainingMs(userId, now, store);
  if (waiting > 0) return { ok: false, waitMs: waiting, attemptsLeft: 0 };
  const hash = await digest(tagged(config.kind, code), fromBase64(config.salt), config.iterations);
  if (sameHash(hash, config.hash)) {
    store.removeItem(failsKey(userId));
    return { ok: true };
  }
  registerFailure(userId, now, store);
  const fails = readFails(userId, store);
  return { ok: false, waitMs: Math.max(0, fails.until - now), attemptsLeft: Math.max(0, FREE_ATTEMPTS - fails.count) };
}
