import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_ENV, type AppEnv } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const env = app.get<AppEnv>(APP_ENV);

  app.setGlobalPrefix('api', { exclude: [] });
  app.enableCors({ origin: env.webOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.enableShutdownHooks();

  await app.listen(env.port);
  Logger.log(`API de Parla escuchando en http://localhost:${env.port}/api`, 'Bootstrap');
}

void bootstrap();
