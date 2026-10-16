import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { join } from 'node:path';
import type { AppEnv } from '../config/env.validation';

/**
 * Cabeceras de seguridad (helmet). Cuando la API también sirve la web, se añade una política de
 * contenido (CSP) estricta: solo scripts propios, fuentes de Google y conexiones al mismo origen.
 */
export function applySecurityHeaders(app: NestExpressApplication, env: AppEnv): void {
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: env.webDist
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              mediaSrc: ["'self'", 'blob:'],
              connectSrc: ["'self'", 'ws:', 'wss:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
              workerSrc: ["'self'"],
              manifestSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      // Micrófono y cámara solo para la propia app (llamadas).
      permittedCrossDomainPolicies: false,
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
    next();
  });
}

/** Producción en un solo proceso: la API sirve la PWA compilada con fallback de rutas a index.html. */
export function serveWebApp(app: NestExpressApplication, webDist: string): void {
  const index = join(webDist, 'index.html');
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders: (res, path) => {
        const noCache = path.endsWith('index.html') || path.endsWith('sw.js') || path.endsWith('.webmanifest');
        res.setHeader('Cache-Control', noCache ? 'no-cache' : 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
