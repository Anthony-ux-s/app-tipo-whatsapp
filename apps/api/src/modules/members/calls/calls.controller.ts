import { Controller, Get, Inject } from '@nestjs/common';
import type { CallIceConfig } from '@parla/types';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';

/** Configuración de red de las llamadas (servidores STUN/TURN). */
@Controller('calls')
export class CallsController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('config')
  config(): CallIceConfig {
    return this.env.ice;
  }
}
