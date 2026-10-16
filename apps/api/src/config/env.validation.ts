import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppEnv {
  port: number;
  webOrigin: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  storageDir: string;
}

/** Carga apps/api/.env (si existe) y valida las variables que la API necesita. */
export function loadEnv(): AppEnv {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const required = ['DATABASE_URL', 'JWT_SECRET'] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')} (copia .env.example a .env)`);
  }

  const port = Number(process.env.PORT ?? 4100);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT debe ser un número de puerto válido');

  return {
    port,
    webOrigin: (process.env.WEB_ORIGIN ?? 'http://localhost:3100').split(',').map((o) => o.trim()),
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    storageDir: resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage'),
  };
}

export const APP_ENV = Symbol('APP_ENV');
