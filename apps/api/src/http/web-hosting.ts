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
              // Teselas del mapa de OpenStreetMap (seguimiento del delivery).
              imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
              mediaSrc: ["'self'", 'blob:'],
              // Rutas por las calles del mapa del delivery (OSRM de OpenStreetMap).
              connectSrc: ["'self'", 'ws:', 'wss:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://router.project-osrm.org'],
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
    // Ubicación solo para la propia app: el repartidor la comparte mientras reparte y el cliente marca su dirección.
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=()');
    next();
  });
}

/** Producción en un solo proceso: la API sirve la PWA compilada con fallback de rutas a index.html. */
export function serveWebApp(app: NestExpressApplication, webDist: string, androidApp: { packageId: string; fingerprints: string[] } | null = null): void {
  const index = join(webDist, 'index.html');
  // Digital Asset Links: Android comprueba aquí que el APK es de este dominio (y lo abre sin barra del navegador).
  app.use('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(
      androidApp
        ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: androidApp.packageId, sha256_cert_fingerprints: androidApp.fingerprints } }]
        : [],
    );
  });
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
