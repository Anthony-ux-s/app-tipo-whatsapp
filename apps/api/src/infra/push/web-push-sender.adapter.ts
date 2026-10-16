import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushPayload } from '@parla/types';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { PushResult, PushSender, PushTarget } from './push-sender.port';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Web Push con VAPID (gratis, sin cuentas de terceros). Si no hay claves en el entorno, se generan
 * una sola vez y se guardan en la carpeta de almacenamiento para que las suscripciones sigan valiendo.
 */
@Injectable()
export class WebPushSender implements PushSender {
  private readonly logger = new Logger('WebPushSender');
  private readonly keys: VapidKeys;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.keys = env.vapid ?? this.loadOrCreateKeys(env.storageDir);
    webpush.setVapidDetails(env.vapidSubject, this.keys.publicKey, this.keys.privateKey);
  }

  private loadOrCreateKeys(dir: string): VapidKeys {
    const file = join(dir, 'vapid.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as VapidKeys;
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(keys));
    this.logger.log('Claves VAPID generadas para las notificaciones push');
    return keys;
  }

  publicKey(): string {
    return this.keys.publicKey;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      this.logger.warn(`No se pudo enviar una notificación push (${status ?? 'sin respuesta'})`);
      return 'failed';
    }
  }
}
