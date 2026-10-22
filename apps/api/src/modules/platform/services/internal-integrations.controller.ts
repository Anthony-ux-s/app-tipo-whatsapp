import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { IntegrableService } from '@parla/types';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { GetInternalIntegrationUseCase, INTEGRABLE_SERVICES } from './use-cases/integrations.use-cases';

/** Para el gateway: con qué API de tienda atender un servicio (URL, ruta y claves). */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/integrations')
export class InternalIntegrationsController {
  constructor(private readonly integration: GetInternalIntegrationUseCase) {}

  @Get(':service')
  async get(@Param('service') service: string) {
    if (!INTEGRABLE_SERVICES.includes(service as IntegrableService)) throw new NotFoundException('Servicio no encontrado');
    const r = await this.integration.execute(service as IntegrableService);
    return { service: r.service, name: r.name, format: r.format, enabled: r.enabled, baseUrl: r.baseUrl, prefix: r.prefix, apiKey: r.apiKey, adminKey: r.adminKey };
  }
}
