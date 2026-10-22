import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_ENV, type AppEnv } from './config/env.validation';
import { applySecurityHeaders, serveWebApp } from './http/web-hosting';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  const env = app.get<AppEnv>(APP_ENV);

  // Detrás de un proxy (Render, Fly, Nginx) la IP real viene en X-Forwarded-For.
  if (env.production) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  applySecurityHeaders(app, env);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.webOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  if (env.webDist) serveWebApp(app, env.webDist, env.androidApp);
  app.enableShutdownHooks();

  await app.listen(env.port);
  Logger.log(`API de Parla escuchando en http://localhost:${env.port}/api`, 'Bootstrap');
  if (env.webDist) Logger.log(`Web servida desde ${env.webDist} en http://localhost:${env.port}`, 'Bootstrap');
}

void bootstrap();
