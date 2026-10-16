import type { PushPayload } from '@parla/types';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 'gone': el navegador dio de baja la suscripción y hay que borrarla. */
export type PushResult = 'sent' | 'gone' | 'failed';

/** Envía notificaciones push a navegadores (Web Push / VAPID). */
export interface PushSender {
  publicKey(): string;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
