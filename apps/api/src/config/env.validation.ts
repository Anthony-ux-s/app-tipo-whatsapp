import type { CallIceConfig } from '@parla/types';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDispatch, type DispatchConfig } from '../kernel/dispatch';
import { parseDriverPay, type DriverPayConfig } from '../kernel/driver-earnings';

export interface AppEnv {
  production: boolean;
  port: number;
  webOrigin: string[];
  /** URL pública de la web (enlaces de las notificaciones). */
  publicWebUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  storageDir: string;
  /** Servidor OSRM para calcular rutas por las calles (vacío = solo línea recta × factor de calles). */
  routingUrl: string;
  /** Si la API también sirve la web compilada (un solo proceso en producción). */
  webDist: string | null;
  /** App Android (APK): con esto la API publica /.well-known/assetlinks.json y la app se abre sin barra del navegador. */
  androidApp: { packageId: string; fingerprints: string[] } | null;
  /** Claves VAPID para Web Push; si faltan, el adaptador las genera y las guarda. */
  vapid: { publicKey: string; privateKey: string } | null;
  vapidSubject: string;
  /** Servidores STUN/TURN para las llamadas WebRTC. */
  ice: CallIceConfig;
  /** Servicio de tiempo real (Elixir) y token compartido entre servicios internos. */
  realtimeUrl: string;
  internalToken: string;
  /** Dirección con la que el gateway llega al core (las tiendas con catálogo de Parla se sirven desde ahí). */
  coreInternalUrl: string;
  /** Códigos por SMS y correo: OneSignal si está configurado; si no (solo desarrollo), modo de prueba. */
  oneSignal: { appId: string; apiKey: string; smsFrom: string | null } | null;
  /** Vigilancia de los deliveries (pedidos sin repartidor, repartidores que no avanzan). */
  deliveryWatch: DeliveryWatchConfig;
  /** Cuánto gana el repartidor (porcentaje de la tarifa) y mínimos para depositarle. */
  driverPay: DriverPayConfig;
  /** Ofertas por cercanía (radios por oleada). */
  dispatch: DispatchConfig;
}

export interface DeliveryWatchConfig {
  /** Cada cuánto se revisan los pedidos en curso (0 = apagado). */
  intervalMs: number;
  /** Sin repartidor tras estos minutos: se vuelve a ofrecer y se avisa a la tienda. */
  untakenMinutes: number;
  /** Con repartidor pero sin recoger tras estos minutos: se reasigna. */
  pickupMinutes: number;
  /** Sin ubicación del repartidor (antes de recoger) durante estos minutos: se reasigna. */
  silentMinutes: number;
}

export const DEV_JWT_SECRET = 'parla-dev-secret-cambiar-en-produccion';
export const DEV_INTERNAL_TOKEN = 'parla-dev-internal-token';

/** Carga el .env de la raíz del proyecto (o el de apps/api) y valida las variables que la API necesita. */
export function loadEnv(): AppEnv {
  // Lo que ya está definido (Docker, el hosting) tiene prioridad sobre los archivos.
  for (const envFile of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
  }
  const env = process.env;
  const production = env.NODE_ENV === 'production';

  const required = ['DATABASE_URL', 'JWT_SECRET'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')} (copia .env.example a .env en la raíz del proyecto y complétalo)`);
  }
  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL!)) {
    throw new Error('DATABASE_URL debe ser una conexión de PostgreSQL (Supabase): postgresql://usuario:clave@host:6543/postgres?pgbouncer=true');
  }
  if (production && (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET!.length < 32)) {
    throw new Error('En producción JWT_SECRET debe ser un secreto propio de al menos 32 caracteres');
  }

  const internalToken = env.INTERNAL_TOKEN ?? DEV_INTERNAL_TOKEN;
  if (production && (internalToken === DEV_INTERNAL_TOKEN || internalToken.length < 24)) {
    throw new Error('En producción INTERNAL_TOKEN debe ser un secreto propio de al menos 24 caracteres');
  }

  const oneSignal =
    env.ONESIGNAL_APP_ID && env.ONESIGNAL_API_KEY
      ? { appId: env.ONESIGNAL_APP_ID, apiKey: env.ONESIGNAL_API_KEY, smsFrom: env.ONESIGNAL_SMS_FROM || null }
      : null;
  if (production && !oneSignal) {
    throw new Error('En producción se necesita ONESIGNAL_APP_ID y ONESIGNAL_API_KEY para enviar los códigos de verificación');
  }

  const port = Number(env.PORT ?? 4101);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT debe ser un número de puerto válido');

  const webOrigin = (env.WEB_ORIGIN ?? 'http://localhost:3100').split(',').map((o) => o.trim());

  const webDistPath = env.WEB_DIST ? resolve(process.cwd(), env.WEB_DIST) : null;
  const stun = (env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const iceServers: CallIceConfig['iceServers'] = stun.length ? [{ urls: stun }] : [];
  if (env.TURN_URL) {
    iceServers.push({ urls: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }

  return {
    production,
    port,
    webOrigin,
    // En el .env de ejemplo viene vacío: entonces vale el origen de la web.
    publicWebUrl: (env.PUBLIC_WEB_URL || webOrigin[0]).replace(/\/$/, ''),
    jwtSecret: env.JWT_SECRET!,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '7d',
    storageDir: resolve(process.cwd(), env.STORAGE_DIR ?? './storage'),
    routingUrl: (env.ROUTING_URL ?? 'https://router.project-osrm.org').replace(/\/$/, ''),
    webDist: webDistPath && existsSync(resolve(webDistPath, 'index.html')) ? webDistPath : null,
    androidApp:
      env.APK_PACKAGE_ID && env.APK_SHA256_CERT_FINGERPRINTS
        ? { packageId: env.APK_PACKAGE_ID.trim(), fingerprints: env.APK_SHA256_CERT_FINGERPRINTS.split(',').map((f) => f.trim()).filter(Boolean) }
        : null,
    vapid:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
        : null,
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:soporte@parla.app',
    ice: { iceServers },
    realtimeUrl: (env.REALTIME_URL ?? 'http://localhost:4102').replace(/\/$/, ''),
    internalToken,
    coreInternalUrl: (env.CORE_INTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    oneSignal,
    driverPay: parseDriverPay(env),
    dispatch: parseDispatch(env),
    deliveryWatch: {
      intervalMs: Number(env.DELIVERY_WATCH_INTERVAL_MS ?? 60_000),
      untakenMinutes: Number(env.DELIVERY_UNTAKEN_MINUTES ?? 5),
      pickupMinutes: Number(env.DELIVERY_PICKUP_MINUTES ?? 25),
      silentMinutes: Number(env.DELIVERY_SILENT_MINUTES ?? 8),
    },
  };
}

export const APP_ENV = Symbol('APP_ENV');
