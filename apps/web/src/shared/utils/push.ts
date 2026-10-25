import { http } from './http';

export type PushState = 'unsupported' | 'denied' | 'enabled' | 'disabled';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const OPT_OUT_KEY = 'parla.push.optout';

/** La persona las desactivó a propósito en Ajustes: Parla no las vuelve a activar sola. */
export function pushOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setOptOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Sin almacenamiento: no se puede recordar.
  }
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** Estado de las notificaciones push en este navegador. */
export async function pushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'enabled' : 'disabled';
}

/** Pide permiso, suscribe el navegador al servicio push y lo registra en la API. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  setOptOut(false);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const { publicKey } = await http.get<{ publicKey: string }>('/push/public-key');
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await http.post('/push/subscriptions', { endpoint: json.endpoint, keys: json.keys });
  return 'enabled';
}

export async function disablePush(): Promise<PushState> {
  setOptOut(true);
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await http.delete(`/push/subscriptions`, { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return 'disabled';
}

/**
 * Aviso del sistema cuando la app está abierta pero en segundo plano. Aquí sí se puede mostrar el
 * texto: el navegador ya lo descifró (el servidor nunca lo ve).
 */
export async function showLocalNotification(title: string, body: string, url: string, tag: string): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', data: { url } };
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}
